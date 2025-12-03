import { Resend } from 'resend';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

const resendClient = config.resendApiKey ? new Resend(config.resendApiKey) : null;

export const sendVerificationEmail = async (to: string, url: string) => {
  if (!resendClient) {
    logger.warn({ message: 'mail.resend_not_configured', to });
    return;
  }

  try {
    await resendClient.emails.send({
      from: config.mailFrom,
      to,
      subject: 'Verify your email for Ultramagnus',
      html: `<p>Thanks for signing up!</p><p>Please verify your email by clicking <a href="${url}">this link</a>.</p>`
    });
    logger.info({ message: 'mail.verification.sent', to });
  } catch (err) {
    logger.error({ message: 'mail.verification.failed', err, to });
    throw err;
  }
};
