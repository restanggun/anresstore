import nodemailer from "nodemailer";

export const isEmail = (value: string) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);

export function smtpSettings(addresses: string | undefined) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM;
  const recipients = [...new Set((addresses || "").split(",").map(address => address.trim()).filter(Boolean))];
  if (!host || !user || !password || !from || /[\r\n]/.test(from) || !Number.isInteger(port) || port < 1 || port > 65535 ||
    !recipients.length || recipients.length > 10 || recipients.some(address => !isEmail(address))) {
    throw new Error("SMTP configuration incomplete");
  }
  const sender = from.match(/<([^<>]+)>/)?.[1] || from;
  if (!isEmail(sender)) throw new Error("SMTP sender invalid");
  return { host, port, user, password, from, recipients, domain: sender.split("@")[1] };
}

export function createSmtpTransport(config: { host: string; port: number; user: string; password: string }) {
  const secure = process.env.SMTP_SECURE === "true" || config.port === 465;
  return nodemailer.createTransport({
    host: config.host, port: config.port, secure, requireTLS: !secure,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    tls: { rejectUnauthorized: true },
  });
}
