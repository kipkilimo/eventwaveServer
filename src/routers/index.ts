import express from "express";
import authRoutes from "./authRoutes";
import orgRoutes from "./orgRoutes";
import eventRoutes from "./eventRoutes";

import invoiceRoutes from "./invoiceRoutes";
const router = express.Router();

export { startScheduler } from './invoiceRoutes';

router.use("/auth", authRoutes);
router.use("/event", eventRoutes);
router.use("/organization", orgRoutes);

router.use("/billing", invoiceRoutes);
export default router;
