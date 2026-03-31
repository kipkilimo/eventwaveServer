/* ===========================
 * CENTRAL MODEL REGISTRY
 * ===========================
 * Import ALL models so Mongoose registers schemas
 */

// Core models
import "./User";
import "./Event";
import "./Organization";

// Interactive features
// import "./BreakoutRoom";
// import "./Whiteboard";
import "./Chat";
import "./Poll";
import "./Test";
import "./QnA";

// Content & engagement
import "./LiveFeed";
import "./Feedback";
import "./Media";

/* ===========================
 * RUNTIME EXPORTS (SAFE)
 * =========================== */

export { User } from "./User";
export { Event } from "./Event";
export { Organization } from "./Organization";

// export { BreakoutRoom } from "./BreakoutRoom";
// export { Whiteboard } from "./Whiteboard";
export { Chat } from "./Chat";
export { Poll } from "./Poll";
export { Test } from "./Test";
export { QnA } from "./QnA";
export { LiveFeed } from "./LiveFeed";
export { Media } from "./Media";
export { Feedback } from "./Feedback";

/* ===========================
 * FEEDBACK (TYPES ONLY)
 * =========================== */

/* ===========================
 * OPTIONAL BACKWARD COMPAT
 * (runtime-safe namespace)
 * =========================== */

/* ===========================
 * DEBUG (optional)
 * =========================== */

import mongoose from "mongoose";

console.log(`✅ Loaded ${Object.keys(mongoose.models).length} Mongoose models`);
