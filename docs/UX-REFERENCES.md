# UX 참고와 구현 결정

확인일: 2026-09-18. UI를 복제하지 않고 기본 조작 패턴만 참고했습니다.

## 참고한 1차 출처

1. Easybrain, Jigsaw Puzzles 공식 제품 소개
   https://easybrain.com/jigsawpuzzles
   조각 수에 따른 난이도 선택, 드래그 배치, 힌트, 시간 압박 없는 플레이를 확인했습니다. 공식 소개의 조각 수 범위는 36~400이지만, 이 프로젝트는 빠른 모바일 플레이를 위해 12/24/54로 낮췄습니다.
2. Jigsawscapes, 개발자 제공 App Store 설명
   https://apps.apple.com/gb/app/jigsawscapes-jigsaw-puzzles/id1589762792
   확대·축소, 완성 컬렉션, 난이도 선택을 참고했습니다. 계정, 구독, 리더보드, 이벤트는 초기 범위에서 제외했습니다.
3. Daily Jigsaw, 공식 조작 안내
   https://jigsaw.game/how-to-play
   가까운 위치 자동 맞춤, 밑그림, 테두리 조각 분류, 진행 저장을 참고했습니다. 자유 조각끼리의 그룹 결합이나 멀티플레이는 구현하지 않았습니다.

## 이 프로젝트의 선택

세로 화면에서 조각을 작게 쌓아놓는 대신 하단 한 줄 트레이에 크게 표시했습니다. 트레이는 가로 스와이프와 화살표 버튼을 함께 지원합니다. 드래그는 세로 이동을 감지할 때 시작해 가로 스크롤과 충돌을 줄였습니다. 터치 드래그 시 조각을 손가락 위로 띄우고, 탭-탭 배치 방식도 제공합니다.

조각 수 12/24/54는 이 게임을 위한 설계값이지 다른 게임의 공통 표준은 아닙니다. 1080×1600 이미지 비율, 화면상 조각 크기, 빠른 스테이지 전환을 고려했습니다. 작은 화면의 고급 난이도는 1.75배 확대로 보완합니다. 원본 이미지가 하얀 배경인 경우가 많아 퍼즐판 외곽을 짙은 보라색으로 구분했습니다.

힌트는 조각을 자동 완성하지 않고 선택한 조각의 정답 위치를 2.5초 동안 표시합니다. 회전, 시간 제한, 실패 패널티, 광고 보상, 결제는 넣지 않았습니다. 10개 스테이지의 순차 해금과 재도전에 집중합니다.

## 기술 참고

- https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream/DecompressionStream
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- https://playwright.dev/python/docs/ci
