import { PassThrough } from 'node:stream';

import { ZipArchive } from 'archiver';
import nodemailer from 'nodemailer';

export interface EmailAttachment {
    filename: string;
    content: Buffer | string;
    contentType?: string;
}

function requireSecret(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} secret is missing.`);
    return value;
}

async function zipAttachments(attachments: EmailAttachment[]): Promise<Buffer> {
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on('data', (chunk: Buffer) => chunks.push(chunk));
    const complete = new Promise<Buffer>((resolve, reject) => {
        output.on('end', () => resolve(Buffer.concat(chunks)));
        output.on('error', reject);
    });
    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on('error', (error: Error) => output.destroy(error));
    archive.pipe(output);
    for (const attachment of attachments) archive.append(attachment.content, { name: attachment.filename });
    await archive.finalize();
    return complete;
}

export async function sendDigest(subject: string, html: string, attachments: EmailAttachment[]): Promise<string> {
    const user = requireSecret('SMTP_USER');
    const pass = requireSecret('SMTP_APP_PASSWORD').replace(/\s+/g, '');
    const recipient = requireSecret('REPORT_RECIPIENT');
    const totalBytes = attachments.reduce((sum, item) => sum + Buffer.byteLength(item.content), 0);
    const finalAttachments =
        totalBytes > 18 * 1024 * 1024
            ? [
                  {
                      filename: 'job-search-files.zip',
                      content: await zipAttachments(attachments),
                      contentType: 'application/zip',
                  },
              ]
            : attachments;
    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
    await transporter.verify();
    const result = await transporter.sendMail({
        from: `Cloud Job Search <${user}>`,
        to: recipient,
        subject,
        html,
        attachments: finalAttachments,
    });
    return result.messageId;
}
