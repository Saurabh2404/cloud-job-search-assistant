import PDFDocument from 'pdfkit';

import type { ResumeContent } from './types.js';

function addSection(doc: PDFKit.PDFDocument, title: string): void {
    doc.moveDown(0.35);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(title.toUpperCase());
    doc.moveTo(doc.x, doc.y + 1)
        .lineTo(552, doc.y + 1)
        .strokeColor('#9ca3af')
        .lineWidth(0.5)
        .stroke();
    doc.moveDown(0.25);
}

function addBullets(doc: PDFKit.PDFDocument, bullets: string[]): void {
    doc.font('Helvetica').fontSize(8.4).fillColor('#111827');
    for (const bullet of bullets) doc.text(`• ${bullet}`, { indent: 8, paragraphGap: 2, lineGap: 0.5 });
}

export async function createResumePdf(resume: ResumeContent): Promise<Buffer> {
    const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 28, bottom: 28, left: 42, right: 42 },
        bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const completed = new Promise<Buffer>((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
    });

    doc.font('Helvetica-Bold').fontSize(19).fillColor('#111827').text(resume.name, { align: 'center' });
    doc.font('Helvetica').fontSize(8.5).fillColor('#374151').text(resume.contactLine, { align: 'center' });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111827').text(resume.headline, { align: 'center' });
    addSection(doc, 'Professional Summary');
    doc.font('Helvetica').fontSize(8.6).fillColor('#111827').text(resume.summary, { lineGap: 0.6 });
    addSection(doc, 'Technical Skills');
    doc.font('Helvetica').fontSize(8.5).text(resume.skills.join(' | '), { lineGap: 0.5 });
    addSection(doc, 'Experience');
    for (const role of resume.experience) {
        doc.font('Helvetica-Bold').fontSize(9).text(`${role.company} | ${role.title}`);
        doc.font('Helvetica-Oblique').fontSize(8).fillColor('#374151').text(`${role.dates} | ${role.location}`);
        addBullets(doc, role.bullets);
    }
    addSection(doc, 'Projects');
    for (const project of resume.projects) {
        doc.font('Helvetica-Bold').fontSize(8.8).fillColor('#111827').text(`${project.name} | ${project.technologies}`);
        addBullets(doc, project.bullets);
    }
    addSection(doc, 'Education');
    for (const education of resume.education) {
        doc.font('Helvetica-Bold').fontSize(8.7).text(`${education.institution} | ${education.degree}`);
        doc.font('Helvetica')
            .fontSize(8)
            .text(`${education.dates}${education.details ? ` | ${education.details}` : ''}`);
    }
    if (resume.achievements.length) {
        addSection(doc, 'Achievements');
        addBullets(doc, resume.achievements);
    }

    const pageCount = doc.bufferedPageRange().count;
    const finalY = doc.y;
    doc.end();
    const output = await completed;
    if (pageCount !== 1 || finalY > 755) throw new Error(`Resume layout exceeded one page (${pageCount} pages).`);
    return output;
}
