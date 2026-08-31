# VOCA — 단어 암기 시험

교재 사진(OCR)에서 추출한 단어로 만드는 온라인 단어 퀴즈 학습 프로그램.

**접속:** https://eins-going.github.io/voca/

## 구성

| 경로 | 설명 |
|---|---|
| `index.html` | 퀴즈 앱 (객관식/주관식, 성적·오답 관리) |
| `words.js` | 단어 DB — Day 17 (25개), Day 18 (29개) |
| `photos/` | 원본 교재 사진 (OCR 소스) |

## 기능

- **문제 유형**: 객관식(영→뜻), 객관식(뜻→영), 주관식(철자 입력), 혼합
- **무작위 출제** + 틀린 문제는 그 시험 안에서 맞힐 때까지 재출제
- **오답노트 DB**: 첫 시도에 틀린 단어는 저장되어 다음 시험에 자동 포함, 첫 시도 2회 연속 정답 시 자동 졸업
- **성적 관리**: 날짜별 점수 기록, 평균 점수 (브라우저 localStorage 저장)

## 단어 추가하는 법

1. 교재 사진을 `photos/`에 넣는다 (예: `day19_YYYYMMDD.jpg`)
2. Claude Code에게 OCR을 요청해 `words.js`에 `{ day, num, word, meaning }` 형식으로 추가한다
3. commit & push → GitHub Pages에 자동 반영
