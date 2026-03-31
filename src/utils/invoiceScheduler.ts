import Agenda from "agenda";
import { Invoice } from "./models/Invoice";
import { generatePDF, sendAggregatedInvoiceEmail } from "./services/invoice";

const agenda = new Agenda({
  db: { address: process.env.MONGODB_URI! },
});

/* ===========================
 * JOB DEFINITION
 * =========================== */
agenda.define("aggregate-unpaid-invoices", async () => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const invoices = await Invoice.find({
    status: "UNPAID",
    issuedAt: { $lte: cutoff },
  }).populate("organization");

  if (!invoices.length) return;

  const org = invoices[0].organization as any;

  const pdf = await generatePDF(invoices);
  const total = invoices.reduce((s, i) => s + i.amount, 0);

  await sendAggregatedInvoiceEmail(
    org.contactEmail,
    pdf,
    total,
    invoices.length
  );
});

/* ===========================
 * START SCHEDULER
 * =========================== */
export async function startScheduler() {
  await agenda.start();
  await agenda.every("0 9 * * *", "aggregate-unpaid-invoices"); // daily 9AM
  console.log("🕘 Invoice scheduler started");
}
