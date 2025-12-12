# Commands used to instruct agents

## Claude-Flow init

```
npx claude-flow@alpha init --force
```

## Command template

```
npx claude-flow@alpha swarm "" --claude
```

## MVP Specification

```
npx claude-flow@alpha swarm "This is a new application without existing functionality. Create on OpenSpec change proposal based minimum viable product design documented in https://github.com/Derek-Ashmore/error-detection-planning/blob/main/plans/minimum-viable-product-design.md. Please provide any additional notes on the proposal in file docs/minimum-viable-product-implementation-notes. Please show me your thinking step by step in the notes file. Do not implement yet, I just want the OpenSpec change proposal. Please let me know if you need additional information in the notes file." --claude
```

- This is a new application without existing functionality.
- Create on OpenSpec change proposal based minimum viable product design documented in https://github.com/Derek-Ashmore/error-detection-planning/blob/main/plans/minimum-viable-product-design.md.
- Please provide any additional notes on the proposal in file docs/minimum-viable-product-implementation-notes.
- Please show me your thinking step by step in the notes file.
- Do not implement yet, I just want the OpenSpec change proposal.
- Please let me know if you need additional information in the notes file.

## Project Setup Task 1

```
npx claude-flow@alpha swarm "Please implement task 1 Project Setup as documented in file openspec/changes/add-mvp-error-detection-agent/tasks.md. Include a GitHub workflow that will verify all pull requests that are created or changed. Please let me know if you need additional information or capabilities." --claude
```

- Please implement task 1 Project Setup as documented in file openspec/changes/add-mvp-error-detection-agent/tasks.md
- Include a GitHub workflow that will verify all pull requests that are created or changed.
- Please let me know if you need additional information or capabilities.

> Verification Defects

```
npx claude-flow@alpha swarm "The workflow step 'Setup Node.js' in workflow pr-verify.yml received an error that needs a fix. Error: Dependencies lock file is not found in /home/runner/work/error-detection-agent/error-detection-agent. Supported file patterns: package-lock.json,npm-shrinkwrap.json,yarn.lock" --claude
```

- The workflow step 'Setup Node.js' in workflow pr-verify.yml received an error that needs a fix. Error: Dependencies lock file is not found in /home/runner/work/error-detection-agent/error-detection-agent. Supported file patterns: package-lock.json,npm-shrinkwrap.json,yarn.lock

```
npx claude-flow@alpha swarm "The workflow step 'Run Linting' in workflow pr-verify.yml received errors that fixes. /home/runner/work/error-detection-agent/error-detection-agent/src/index.ts
Warning:   13:3  warning  Unexpected console statement  no-console

/home/runner/work/error-detection-agent/error-detection-agent/tests/example.test.ts
Error:   41:29  error  Missing return type on function                              @typescript-eslint/explicit-function-return-type
Error:   49:35  error  Missing return type on function                              @typescript-eslint/explicit-function-return-type
Error:   49:35  error  Async arrow function 'asyncError' has no 'await' expression  @typescript-eslint/require-await
" --claude
```

The workflow step 'Run Linting' in workflow pr-verify.yml received errors that fixes. /home/runner/work/error-detection-agent/error-detection-agent/src/index.ts
Warning:   13:3  warning  Unexpected console statement  no-console

/home/runner/work/error-detection-agent/error-detection-agent/tests/example.test.ts
Error:   41:29  error  Missing return type on function                              @typescript-eslint/explicit-function-return-type
Error:   49:35  error  Missing return type on function                              @typescript-eslint/explicit-function-return-type
Error:   49:35  error  Async arrow function 'asyncError' has no 'await' expression  @typescript-eslint/require-await
