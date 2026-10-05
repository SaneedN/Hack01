const { segmentOf, revenueByDay, statusCounts, paginate } = require("../src/services/analyticsService");

const NOW = new Date("2026-10-05T12:00:00Z").getTime();
const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString();

describe("segmentOf", () => {
  test("classifies customers", () => {
    expect(segmentOf({ order_count: 0 }, NOW)).toBe("new");
    expect(segmentOf({ order_count: 1, total_spent: 500, last_order_date: daysAgo(2) }, NOW)).toBe("new");
    expect(segmentOf({ order_count: 2, total_spent: 900, last_order_date: daysAgo(5) }, NOW)).toBe("regular");
    expect(segmentOf({ order_count: 4, total_spent: 900, last_order_date: daysAgo(5) }, NOW)).toBe("vip");
    expect(segmentOf({ order_count: 1, total_spent: 20000, last_order_date: daysAgo(3) }, NOW)).toBe("vip");
    expect(segmentOf({ order_count: 2, total_spent: 900, last_order_date: daysAgo(60) }, NOW)).toBe("at-risk");
    expect(segmentOf({ order_count: 5, total_spent: 50000, last_order_date: daysAgo(90) }, NOW)).toBe("at-risk");
  });
});

describe("revenueByDay / statusCounts / paginate", () => {
  const orders = [
    { order_date: daysAgo(0), total: "100", status: "completed" },
    { order_date: daysAgo(0), total: "50", status: "cancelled" },
    { order_date: daysAgo(1), total: "30", status: "processing" },
    { order_date: daysAgo(40), total: "999", status: "completed" },
  ];
  test("buckets revenue and excludes cancelled/refunded", () => {
    const days = revenueByDay(orders, 14, NOW);
    expect(days).toHaveLength(14);
    expect(days[13].revenue).toBe(100);
    expect(days[13].orders).toBe(2);
    expect(days[12].revenue).toBe(30);
  });
  test("counts statuses", () => {
    expect(statusCounts(orders)).toEqual({ completed: 2, cancelled: 1, processing: 1 });
  });
  test("paginates and clamps", () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const p = paginate(items, 3, 10);
    expect(p.items).toHaveLength(5);
    expect(p.pages).toBe(3);
    expect(paginate(items, 99, 10).page).toBe(3);
    expect(paginate([], 1, 10).pages).toBe(1);
  });
});
