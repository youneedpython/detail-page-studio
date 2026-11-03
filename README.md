# SmartStore Detail Page

네이버 스마트스토어 상세페이지 분석 / 제작 웹 서비스. 현재 홈 골격과 분석 / 제작 준비 중 화면을 제공한다.

- 진행 상태: [docs/07-TASKS.md](docs/07-TASKS.md)
- 작업 규칙: [AGENTS.md](AGENTS.md)
- Harness 실행: [docs/12-ORCHESTRATOR-DESIGN.md](docs/12-ORCHESTRATOR-DESIGN.md)

## 로컬 검증

Node.js는 `.nvmrc`의 Version을 사용한다. `npm ci` 후 `npm run dev`로 실행하고
`http://localhost:3000`, `/analyze`, `/create`를 확인한다.
`next-env.d.ts`는 Next.js가 생성하며 Git에서 제외한다.

개별 검사: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
운영 모드는 Build 후 `npm start`로 실행한다.

```bash
sh scripts/verify.sh        # 또는 PowerShell: ./scripts/verify.ps1
```

전체 검증은 Harness Test 이후 npm ci → lint → typecheck → test → build 순서로 실행한다.
