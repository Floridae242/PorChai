export default function AppHome() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <h1 className="font-display text-5xl">พอใช้</h1>
      <p className="font-body text-base text-secondary">
        เงินพอใช้ทั้งเดือน ไม่ต้องเครียดเรื่องเงิน
      </p>
      <button
        type="button"
        className="self-start rounded-pill bg-action-primary px-6 py-3 font-body font-semibold text-on-action"
      >
        เริ่มใช้งาน
      </button>
      <div className="rounded-md border border-line bg-card p-4">
        <p className="font-body text-sm text-secondary">เหลือใช้วันนี้</p>
        <p className="font-body text-4xl font-bold">฿350</p>
      </div>
    </main>
  );
}
