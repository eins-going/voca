# VOCA — 단어 암기 시험

사진을 찍어 올리면 AI가 단어를 추출하고, 그걸로 시험을 보는 온라인 단어 학습 프로그램.

**접속:** <https://eins-going.github.io/voca/>

## 아키텍처

```text
GitHub Pages (index.html)  ←  정적 웹앱, push하면 자동 배포
        │
        ▼
Cloudflare Worker (voca-api.einsgoing.workers.dev)
        ├── D1  voca-db       단어 / 성적 / 오답노트 / 사진 메타
        ├── R2  voca-photos   업로드한 교재 사진 원본
        └── Gemini API        사진 → 단어·뜻 추출 (gemini-3.6-flash)
                              단어 발음 생성 (gemini-3.1-flash-tts-preview → R2 캐시)
```

| 경로 | 설명 |
| --- | --- |
| `index.html` | 앱 본체 (시험, 성적, 오답노트, 사진 업로드 UI) |
| `worker/` | Cloudflare Worker API + D1 스키마 |
| `words.js` | 오프라인 폴백용 단어 데이터 (DB가 원본) |
| `photos/` | 초기 교재 사진 (이후 업로드분은 R2에 저장) |

## 기능

- **사진으로 단어 추가**: "추가" 탭에서 단어장 사진 업로드 → Gemini가 Day 번호·단어·뜻 자동 추출 → 검수 후 저장 → 즉시 시험 범위에 등장
- **문제 유형**: 주관식(철자 입력, 글자 수 슬롯), 객관식(영→뜻 / 뜻→영), 혼합
- **무작위 출제** + 틀린 문제는 그 시험 안에서 맞힐 때까지 재출제
- **오답노트**: 첫 시도에 틀린 단어는 DB에 저장되어 다음 시험에 자동 포함, 첫 시도 2회 연속 정답 시 졸업
- **성적 관리**: 날짜별 점수 기록, 평균 점수
- **단어 발음**: AI 생성 음성(R2 캐시) 자동 재생, 헤더에서 소리 켜기/끄기
- **기기 간 동기화**: 동기화 코드 하나로 폰·PC 기록 통합 (로그인 불필요)

## Worker 배포 (수정 시)

```bash
cd worker
# .env의 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID 필요
npx wrangler deploy
```
