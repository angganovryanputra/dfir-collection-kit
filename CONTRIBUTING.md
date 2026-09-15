# Contributing

1. Create a focused branch and explain the security or workflow impact.
2. Never commit evidence, `.env` files, certificates, private keys, generated
   databases, or parser binaries.
3. Run frontend lint, typecheck and tests, backend pytest, and `go test ./...`
   before opening a pull request.
4. Changes to evidence identity, hashing, timeline normalization, or chain of
   custody require a regression test and migration notes.
5. Keep public documentation and Docker workflows in sync with the tested
   compose configuration.
