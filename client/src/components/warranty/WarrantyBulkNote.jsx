export default function WarrantyBulkNote() {
  return (
    <>
      <p>
        One item per row. Items sharing the same vendor, PO number, and invoice number are grouped into one purchase/warranty record.
      </p>
      <div className="master-bulk-example">
        <p>PO-001 | INV-001 | VFD Panel</p>
        <p>PO-001 | INV-001 | HMI</p>
        <p>PO-001 | INV-001 | PLC</p>
        <p className="master-bulk-example__result">Creates 1 purchase with 3 items.</p>
      </div>
    </>
  )
}
