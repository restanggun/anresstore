import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { createSmtpTransport, smtpSettings } from "../common/smtp";
import { adminDb } from "./admin-store";

type Job = {
  id: string;
  claim_token: string;
  event: "admin" | "new";
  subject: string;
  admin_title: string | null;
};

@Injectable()
export class AdminNotificationEmailWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  protected createTransport = createSmtpTransport;

  onModuleInit() {
    if (process.env.ADMIN_NOTIFICATION_EMAIL_ENABLED !== "true") return;
    const poll = () => { void this.run().catch(() => console.warn("admin.notification_email_queue_unavailable")); };
    this.timer = setInterval(poll, 30000);
    this.timer.unref();
    poll();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run() {
    if (this.running || process.env.ADMIN_NOTIFICATION_EMAIL_ENABLED !== "true") return;
    this.running = true;
    try {
      const config = smtpSettings(process.env.ADMIN_NOTIFICATION_EMAILS);
      const dashboard = new URL("/", process.env.AUTH_ADMIN_ORIGIN || "http://localhost:3001");
      // The hosted migration named the staff channel "resend". The channel is transport-independent.
      const jobs = await adminDb<Job>("rpc/claim_support_emails", "", "POST", { p_channel: "resend" });
      if (!jobs.length) return;
      const transport = this.createTransport(config);
      try {
        for (const job of jobs) {
          const title = job.event === "new" ? "Tiket CS baru" : job.admin_title || "Notifikasi admin";
          let providerId: string | null = null;
          let success = false;
          try {
            const result = await transport.sendMail({
              from: config.from,
              to: config.recipients,
              subject: title.replace(/[\r\n]+/g, " "),
              text: `${title}\n\n${job.subject}\n\nBuka dashboard admin:\n${dashboard.href}`,
              messageId: `<admin-${job.id}@${config.domain}>`,
            });
            success = !result.rejected?.length;
            if (success) providerId = result.messageId || null;
          } catch {
            // SMTP errors may contain private connection details.
          }
          if (!success) console.warn("admin.notification_email_delivery_failed");
          await adminDb("rpc/finish_support_email", "", "POST", {
            p_id: job.id, p_claim: job.claim_token, p_success: success, p_provider: providerId,
            p_error: success ? null : "SMTP delivery unavailable",
          });
        }
      } finally {
        transport.close();
      }
    } finally {
      this.running = false;
    }
  }
}
