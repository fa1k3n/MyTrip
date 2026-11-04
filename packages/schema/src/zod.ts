// SP-12: zod for the schema files, set to jitless first: zod 4 otherwise probes `new Function`, which the strict content security policy reports as a blocked eval in the browser.
import { z } from "zod";

z.config({ jitless: true });

export { z };
export { ZodError } from "zod";
