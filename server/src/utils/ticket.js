import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { env } from '../config/env.js';

const money = (n) => `$${Number(n).toFixed(2)}`;

export async function buildTicketPdf({ booking, event, holder }) {
  const qrDataUrl = await QRCode.toDataURL(booking.ticketCode, { margin: 1, width: 240 });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;

    // Header band
    doc.rect(0, 0, W, 150).fill('#0f172a');
    doc.fillColor('#a78bfa').fontSize(13).font('Helvetica-Bold').text('BOOKIT', 50, 44, { characterSpacing: 4 });
    doc.fillColor('#ffffff').fontSize(24).text('Admission Ticket', 50, 66);
    doc.fillColor('#94a3b8').fontSize(10).font('Helvetica').text('Present this ticket (printed or digital) at the entrance.', 50, 100);

    // Event details
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(20).text(event.title, 50, 190, { width: W - 100 });
    doc.font('Helvetica').fillColor('#475569').fontSize(11);
    doc.text(`${new Date(event.startsAt).toUTCString()}`, 50, 230);
    doc.text(`${event.location.venue} · ${event.location.city}`, 50, 248);
    doc.text(`Category: ${event.category}`, 50, 266);

    // Ticket box
    const boxTop = 310;
    doc.rect(50, boxTop, W - 100, 190).lineWidth(1.2).strokeColor('#c4b5fd').stroke();
    doc.save().moveTo(50, boxTop).lineTo(W - 50, boxTop).lineTo(W - 50, boxTop + 190).lineTo(50, boxTop + 190).lineTo(50, boxTop).clip();

    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text('TICKET HOLDER', 70, boxTop + 24, { characterSpacing: 2 });
    doc.fontSize(16).text(holder, 70, boxTop + 42);

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#64748b').text('TIER', 70, boxTop + 82, { characterSpacing: 2 });
    doc.fillColor('#0f172a').fontSize(16).text(booking.tierName, 70, boxTop + 100);

    doc.fontSize(10).fillColor('#64748b').font('Helvetica-Bold').text('QUANTITY', 70, boxTop + 140, { characterSpacing: 2 });
    doc.fillColor('#0f172a').fontSize(16).font('Helvetica-Bold').text(String(booking.quantity), 70, boxTop + 158);

    doc.fontSize(10).fillColor('#64748b').font('Helvetica-Bold').text('AMOUNT PAID', 240, boxTop + 140, { characterSpacing: 2 });
    doc.fillColor('#0f172a').fontSize(16).font('Helvetica-Bold').text(money(booking.totalAmount), 240, boxTop + 158);

    // QR code
    doc.image(qrDataUrl, W - 205, boxTop + 35, { width: 120, height: 120 });

    // Ticket code
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(10).text('TICKET CODE', 50, 540, { characterSpacing: 2 });
    doc.fillColor('#7c3aed').font('Helvetica-Bold').fontSize(30).text(booking.ticketCode, 50, 558, { characterSpacing: 2 });

    doc.fillColor('#94a3b8').font('Helvetica').fontSize(9);
    doc.text(`Booking ID: ${booking._id}`, 50, 610);
    doc.text(`Booked on ${new Date(booking.createdAt).toUTCString()}`, 50, 626);
    if (booking.promoCode) doc.text(`Promo applied: ${booking.promoCode} (−${money(booking.discountAmount)})`, 50, 642);

    doc.fillColor('#cbd5e1').fontSize(8).text(
      `Verify at ${env.CLIENT_URL}/verify — this ticket was issued by BookIt. Non-transferable.`,
      50,
      700,
      { width: W - 100, align: 'center' },
    );

    doc.restore();
    doc.end();
  });
}
