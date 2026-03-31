# Eventi Backend (Scaffold)

This scaffold includes:
- Updated Poll and Test Mongoose models with multiple poll/Test types (Single choice, Multiple choice, Open text, Rating, Ranking; and Test types: MCQ single, MCQ multiple, True/False, Matching, Fill-in).
- GraphQL schema additions for poll/Test types and inputs.
- Resolver implementations for creating polls/Tests, voting/responding, and basic queries with role checks using existing auth utils.

Run:
1. Copy `.env.example` to `.env` and fill values.
2. `npm install`
3. `npm run dev`

This is a scaffold for development — tweak and secure before production.
