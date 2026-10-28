// autoApply.js
// Handles the ONE submission path that's safely automatable: jobs whose
// application method is a plain email address. Attaches the correct
// resume for the job's track and sends the note built from the emailTemplate
// and summaries in config/applyKit.json.
//
// LIMITATION: only works for jobs where Submission Method is "Email" and
// an address appears in the Notes column (convention: "apply: jobs@co.com").
// Everything else correctly falls to "Needs Manual Apply" per the plan.

import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { loadApplyKit, applicationEmail } from "./applyKit.js";

const RESUMES_DIR = path.join(process.cwd(), "resumes");

function getTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_SERVER || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_APP_PASSWORD,
    },
  });
}

export async function sendApplication(job, recipientEmail) {
  const resumePath = path.join(RESUMES_DIR, job.resumeFile || "");
  if (!fs.existsSync(resumePath)) {
    console.warn(`[autoApply] Resume not found: ${resumePath}, skipping ${job.company}`);
    return false;
  }

  const kit = loadApplyKit();
  const { subject, body } = applicationEmail(kit, job);
  if (/EDIT ME/.test(body) || !kit.emailTemplate) {
    console.warn(`[autoApply] Apply kit still has EDIT ME lines, not emailing ${job.company}`);
    return false;
  }

  try {
    const transport = getTransport();
    await transport.sendMail({
      from: process.env.SMTP_EMAIL,
      to: recipientEmail,
      subject,
      text: body,
      attachments: [
        {
          filename: path.basename(resumePath),
          path: resumePath,
        },
      ],
    });
    console.log(`[autoApply] Sent application to ${job.company} (${recipientEmail})`);
    return true;
  } catch (err) {
    console.warn(`[autoApply] FAILED to send to ${job.company}: ${err.message}`);
    return false;
  }
}
