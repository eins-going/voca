// VOCA API — Cloudflare Worker
// D1(DB) + R2(PHOTOS) + Gemini(GEMINI_API_KEY 시크릿)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS } });

const ANALYZE_PROMPT = `이 사진은 한국의 영어 단어장 교재 페이지다. 표에 번호, 영어 단어, 우리말 뜻이 나열되어 있다.
사진에 보이는 모든 단어 항목을 순서대로 추출해서 아래 형식의 JSON으로만 응답하라:
{"day": 페이지에 DAY 번호가 보이면 그 숫자(정수), 안 보이면 null, "words": [{"num": 번호, "word": "영어단어", "meaning": "우리말 뜻"}]}
규칙:
- word는 소문자 영어로만 쓴다.
- meaning은 사진에 표기된 우리말 뜻을 그대로 쓰되, 쉼표/세미콜론 구분을 유지한다.
- 손글씨 메모나 체크 표시는 무시하고 인쇄된 내용만 추출한다.
- 항목을 빠뜨리지 마라.`;

// L16 PCM → WAV 컨테이너 (Gemini TTS는 헤더 없는 PCM을 반환)
function pcmToWav(pcm, sampleRate) {
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF"); v.setUint32(4, 36 + pcm.length, true); writeStr(8, "WAVE");
  writeStr(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  writeStr(36, "data"); v.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out;
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    const p = url.pathname;
    try {
      // ── 단어 ──
      if (p === "/api/words" && req.method === "GET") {
        const { results } = await env.DB.prepare("SELECT day, num, word, meaning FROM words ORDER BY day, num").all();
        return json({ words: results });
      }
      if (p === "/api/words" && req.method === "POST") {
        const { words } = await req.json();
        if (!Array.isArray(words) || !words.length) return json({ error: "words 배열이 비어 있음" }, 400);
        const stmt = env.DB.prepare(
          "INSERT INTO words (day, num, word, meaning) VALUES (?1,?2,?3,?4) " +
          "ON CONFLICT(word) DO UPDATE SET day=?1, num=?2, meaning=?4"
        );
        await env.DB.batch(words.map((w) =>
          stmt.bind(Number(w.day), Number(w.num), String(w.word).trim().toLowerCase(), String(w.meaning).trim())
        ));
        return json({ ok: true, count: words.length });
      }

      // ── 성적 + 오답 상태 (한 번에) ──
      if (p === "/api/state" && req.method === "GET") {
        const code = url.searchParams.get("code");
        if (!code) return json({ error: "code 필요" }, 400);
        const wrong = await env.DB.prepare(
          "SELECT word, wrong_count, streak, last_wrong FROM wrong_notes WHERE sync_code=?1"
        ).bind(code).all();
        const results = await env.DB.prepare(
          "SELECT taken_at, scope, mode, total, correct, pct, wrong_words FROM results WHERE sync_code=?1 ORDER BY taken_at DESC LIMIT 300"
        ).bind(code).all();
        return json({
          wrong: wrong.results,
          results: results.results.map((r) => ({ ...r, wrong_words: JSON.parse(r.wrong_words || "[]") })),
        });
      }

      // ── 성적 ──
      if (p === "/api/results" && req.method === "POST") {
        const b = await req.json();
        if (!b.sync_code) return json({ error: "sync_code 필요" }, 400);
        await env.DB.prepare(
          "INSERT INTO results (sync_code, taken_at, scope, mode, total, correct, pct, wrong_words) VALUES (?,?,?,?,?,?,?,?)"
        ).bind(b.sync_code, b.taken_at, b.scope, b.mode, b.total, b.correct, b.pct, JSON.stringify(b.wrong_words || [])).run();
        return json({ ok: true });
      }
      if (p === "/api/results" && req.method === "DELETE") {
        await env.DB.prepare("DELETE FROM results WHERE sync_code=?1").bind(url.searchParams.get("code")).run();
        return json({ ok: true });
      }

      // ── 오답노트 ──
      if (p === "/api/wrong" && req.method === "POST") {
        const { sync_code, rows } = await req.json();
        if (!sync_code || !Array.isArray(rows)) return json({ error: "잘못된 요청" }, 400);
        if (rows.length) {
          const stmt = env.DB.prepare(
            "INSERT INTO wrong_notes (sync_code, word, wrong_count, streak, last_wrong) VALUES (?1,?2,?3,?4,?5) " +
            "ON CONFLICT(sync_code, word) DO UPDATE SET wrong_count=?3, streak=?4, last_wrong=?5"
          );
          await env.DB.batch(rows.map((r) => stmt.bind(sync_code, r.word, r.wrong_count, r.streak, r.last_wrong || null)));
        }
        return json({ ok: true });
      }
      if (p === "/api/wrong" && req.method === "DELETE") {
        const code = url.searchParams.get("code");
        const word = url.searchParams.get("word");
        if (word) await env.DB.prepare("DELETE FROM wrong_notes WHERE sync_code=?1 AND word=?2").bind(code, word).run();
        else await env.DB.prepare("DELETE FROM wrong_notes WHERE sync_code=?1").bind(code).run();
        return json({ ok: true });
      }

      // ── 사진 업로드 + Gemini 분석 ──
      if (p === "/api/analyze" && req.method === "POST") {
        const { image, day } = await req.json();
        const m = /^data:(image\/[\w.+-]+);base64,(.+)$/.exec(image || "");
        if (!m) return json({ error: "image는 data URL이어야 함" }, 400);
        const mime = m[1], b64 = m[2];

        // R2에 원본 저장
        const key = `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${mime.split("/")[1].replace("jpeg", "jpg")}`;
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: mime } });
        await env.DB.prepare("INSERT INTO photos (key, uploaded_at, day) VALUES (?1, datetime('now'), ?2)")
          .bind(key, day || null).run();

        // Gemini로 단어 추출
        const g = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${env.GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: ANALYZE_PROMPT }, { inline_data: { mime_type: mime, data: b64 } }] }],
              generationConfig: { response_mime_type: "application/json", temperature: 0 },
            }),
          }
        );
        if (!g.ok) return json({ error: `Gemini ${g.status}: ${await g.text()}` }, 502);
        const gd = await g.json();
        let parsed;
        try {
          parsed = JSON.parse(gd.candidates[0].content.parts[0].text);
        } catch {
          return json({ error: "AI 응답을 해석하지 못했습니다. 다시 시도해 주세요." }, 502);
        }
        return json({ ok: true, photo: key, day: parsed.day ?? (day || null), words: parsed.words || [] });
      }

      // ── 단어 발음 (TTS 생성 + R2 캐시) ──
      if (p.startsWith("/api/audio/") && req.method === "GET") {
        const word = decodeURIComponent(p.slice("/api/audio/".length)).toLowerCase();
        if (!/^[a-z][a-z' -]{0,40}$/.test(word)) return json({ error: "잘못된 단어" }, 400);
        const key = `audio/${word}.wav`;
        const audioHeaders = { "Content-Type": "audio/wav", "Cache-Control": "public, max-age=31536000, immutable", ...CORS };

        const cached = await env.PHOTOS.get(key);
        if (cached) return new Response(cached.body, { headers: audioHeaders });

        // 최초 요청: Gemini TTS로 생성
        const g = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent?key=${env.GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `Pronounce the English word clearly: ${word}` }] }],
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
              },
            }),
          }
        );
        if (!g.ok) return json({ error: `TTS ${g.status}: ${await g.text()}` }, 502);
        const gd = await g.json();
        const part = gd.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (!part) return json({ error: "TTS 생성 실패", detail: gd.promptFeedback || null }, 502);
        const rate = Number(/rate=(\d+)/.exec(part.mimeType)?.[1] || 24000);
        const pcm = Uint8Array.from(atob(part.data), (c) => c.charCodeAt(0));
        const wav = pcmToWav(pcm, rate);
        await env.PHOTOS.put(key, wav, { httpMetadata: { contentType: "audio/wav" } });
        return new Response(wav, { headers: audioHeaders });
      }

      // ── 단어 연상 이미지 (생성 + R2 캐시) ──
      if (p.startsWith("/api/image/") && req.method === "GET") {
        const word = decodeURIComponent(p.slice("/api/image/".length)).toLowerCase();
        if (!/^[a-z][a-z' -]{0,40}$/.test(word)) return json({ error: "잘못된 단어" }, 400);
        const key = `images/${word}.jpg`;
        const imgHeaders = { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable", ...CORS };

        const cached = await env.PHOTOS.get(key);
        if (cached) return new Response(cached.body, { headers: imgHeaders });

        // 뜻을 DB에서 찾아 프롬프트에 반영 (다의어 구분)
        const row = await env.DB.prepare("SELECT meaning FROM words WHERE word=?1").bind(word).first();
        if (!row) return json({ error: "단어장에 없는 단어" }, 404);

        const prompt =
          `Create a simple, vivid cartoon illustration that helps a Korean student memorize the English word "${word}" ` +
          `meaning "${row.meaning}". Invent one clear, memorable scene that directly and unmistakably conveys this meaning. ` +
          `Educational flashcard style, bright colors, single scene, no text or letters anywhere in the image.`;
        const g = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${env.GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseModalities: ["IMAGE"] },
            }),
          }
        );
        if (!g.ok) return json({ error: `이미지 생성 ${g.status}: ${await g.text()}` }, 502);
        const gd = await g.json();
        const part = (gd.candidates?.[0]?.content?.parts || []).find((x) => x.inlineData);
        if (!part) return json({ error: "이미지 생성 실패" }, 502);
        const bytes = Uint8Array.from(atob(part.inlineData.data), (c) => c.charCodeAt(0));
        await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: part.inlineData.mimeType || "image/jpeg" } });
        return new Response(bytes, { headers: { ...imgHeaders, "Content-Type": part.inlineData.mimeType || "image/jpeg" } });
      }

      // ── 사진 조회 ──
      if (p === "/api/photos" && req.method === "GET") {
        const { results } = await env.DB.prepare("SELECT key, uploaded_at, day FROM photos ORDER BY id DESC").all();
        return json({ photos: results });
      }
      if (p.startsWith("/api/photo/") && req.method === "GET") {
        const key = decodeURIComponent(p.slice("/api/photo/".length));
        const obj = await env.PHOTOS.get(key);
        if (!obj) return json({ error: "없는 사진" }, 404);
        return new Response(obj.body, {
          headers: { "Content-Type": obj.httpMetadata?.contentType || "image/jpeg", "Cache-Control": "public, max-age=86400", ...CORS },
        });
      }

      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: String(e) }, 500);
    }
  },
};
