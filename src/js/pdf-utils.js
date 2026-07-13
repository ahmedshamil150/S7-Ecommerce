export function generateInvoice(order) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const items = Array.isArray(order.items) ? order.items : [];

  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('S7 SPORTS', 14, 22);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Premium Cricket Equipment', 14, 29);

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('INVOICE', 160, 22, { align: 'right' });

  const line1 = 42;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Invoice #: ${order.invoice_number || 'N/A'}`, 14, line1);
  doc.text(`Order #: ${order.order_number || order.id}`, 14, line1 + 6);
  doc.text(`Date: ${new Date(order.created_at).toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' })}`, 14, line1 + 12);

  doc.setFont('helvetica', 'bold');
  doc.text('Bill To:', 14, line1 + 24);
  doc.setFont('helvetica', 'normal');
  doc.text(`Name: ${order.customer_name || 'N/A'}`, 14, line1 + 32);
  doc.text(`Phone: ${order.customer_phone || 'N/A'}`, 14, line1 + 38);
  const addrLines = doc.splitTextToSize(`Address: ${order.customer_address || 'N/A'}`, 180);
  doc.text(addrLines, 14, line1 + 44);

  const tableTop = Math.max(line1 + 44 + addrLines.length * 5 + 6, 95);
  const tableBody = items.map(it => [
    it.title + (it.variant_label ? ` (${it.variant_label})` : ''),
    String(it.qty || 1),
    `Rs ${Number(it.price).toLocaleString()}`,
    `Rs ${(Number(it.price) * Number(it.qty || 1)).toLocaleString()}`
  ]);

  doc.autoTable({
    startY: tableTop,
    head: [['Item', 'Qty', 'Price', 'Total']],
    body: tableBody,
    theme: 'grid',
    headStyles: { fillColor: [0, 0, 0], textColor: [202, 243, 0], fontSize: 9, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 85 }, 1: { cellWidth: 20, halign: 'center' }, 2: { cellWidth: 35, halign: 'right' }, 3: { cellWidth: 35, halign: 'right' } }
  });

  const fy = doc.lastAutoTable.finalY + 8;
  const subtotal = items.reduce((s, it) => s + Number(it.price) * Number(it.qty || 1), 0);
  const df = Number(order.delivery_fee) || 0;
  const total = Number(order.total) || subtotal;
  const discount = subtotal + df - total;

  const rightX = 120;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal:', rightX, fy, { align: 'left' });
  doc.text(`Rs ${subtotal.toLocaleString()}`, 190, fy, { align: 'right' });
  let row = fy + 6;
  if (df > 0) {
    doc.text('Delivery Fee:', rightX, row);
    doc.text(`Rs ${df.toLocaleString()}`, 190, row, { align: 'right' });
    row += 6;
  }
  if (discount > 0 && order.coupon_code) {
    doc.text(`Discount (${order.coupon_code}):`, rightX, row);
    doc.text(`-Rs ${discount.toLocaleString()}`, 190, row, { align: 'right' });
    row += 6;
  }
  doc.setDrawColor(0);
  doc.line(rightX, row + 1, 190, row + 1);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Total:', rightX, row + 8);
  doc.text(`Rs ${total.toLocaleString()}`, 190, row + 8, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Thank you for shopping with S7 Sports!', 14, 278);
  doc.text('Rawalpindi / Islamabad, Pakistan | s7sportspk@gmail.com', 14, 283);

  doc.save(`Invoice-${order.order_number || 'order'}.pdf`);
}

export function generateDeliveryChallan(order) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const items = Array.isArray(order.items) ? order.items : [];

  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('S7 SPORTS', 14, 22);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Premium Cricket Equipment', 14, 29);

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('DELIVERY CHALLAN', 110, 22, { align: 'right' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Order #: ${order.order_number || order.id}`, 14, 44);
  doc.text(`Date: ${new Date(order.created_at).toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' })}`, 14, 50);

  doc.setFont('helvetica', 'bold');
  doc.text('Deliver To:', 14, 62);
  doc.setFont('helvetica', 'normal');
  doc.text(`Name: ${order.customer_name || 'N/A'}`, 14, 70);
  doc.text(`Phone: ${order.customer_phone || 'N/A'}`, 14, 76);
  const addrLines = doc.splitTextToSize(`Address: ${order.customer_address || 'N/A'}`, 180);
  doc.text(addrLines, 14, 82);

  const tableTop = Math.max(82 + addrLines.length * 5 + 6, 105);
  const tableBody = items.map(it => [
    it.title + (it.variant_label ? ` (${it.variant_label})` : ''),
    String(it.qty || 1)
  ]);

  doc.autoTable({
    startY: tableTop,
    head: [['Item', 'Qty']],
    body: tableBody,
    theme: 'grid',
    headStyles: { fillColor: [0, 0, 0], textColor: [202, 243, 0], fontSize: 9, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 130 }, 1: { cellWidth: 25, halign: 'center' } }
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('S7 SPORTS - Premium Cricket Equipment', 14, 278);
  doc.text('Rawalpindi / Islamabad, Pakistan | s7sportspk@gmail.com', 14, 283);

  doc.save(`DeliveryChallan-${order.order_number || 'order'}.pdf`);
}
