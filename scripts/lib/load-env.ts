import { config } from "dotenv";

// Scripts run outside Next, so load .env.local (then .env) the way Next would.
// Existing shell variables win; dotenv never overrides them.
config({ path: ".env.local", quiet: true });
config({ quiet: true });
