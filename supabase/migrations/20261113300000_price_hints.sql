-- ราคาประมาณของร้านที่คนถามบ่อย: «ถ้ากินตี๋น้อยจะเหลือเท่าไร» without a price gets the usual price here,
-- offered to try before paying (lib/advice/price-hint.ts). Never recorded: paying is still the try card's
-- [ยืนยันจ่ายจริง]. The team edits rows in Supabase Studio; active = false hides a row without losing it.
create table price_hints (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (btrim(name) <> ''), -- shown in the answer
  aliases text[] not null default '{}', -- other ways people type it; spaces and case do not matter
  price bigint not null check (price > 0), -- satang, one person / one cup
  unit text not null default '/คน',
  category text not null default 'food' check (category in ('food', 'transport', 'supplies', 'other')),
  source_url text not null,
  checked_on date not null, -- shown as "ต.ค. 69": when someone last checked the price
  active boolean not null default true,
  created_at timestamptz not null default now()
);

revoke all on price_hints from anon, authenticated;
alter table price_hints enable row level security;

-- Searched 13 Nov 2569 and picked by the team. Prices change by branch and promotion: check before the demo.
insert into price_hints (name, aliases, price, unit, source_url, checked_on) values
  -- 279 net with refills from 1 Oct 2569 (news of the price change)
  ('สุกี้ตี๋น้อย', '{ตี๋น้อย,teenoi,suki teenoi}', 27900, '/คน', 'https://www.prachachat.net/business/news-2072849', '2026-11-13'),
  -- 259+ buffet + 39 refill + VAT ≈ 319 (worked out from reviews; no official 2569 price list)
  ('ชาบูชิ', '{shabushi}', 31900, '/คน', 'https://salehere.co.th/shabushi/promotions/shabu-super-value-259-baht', '2026-11-13'),
  -- GON Buffet 399 NET; the last campaign ended 27 Sep 2569
  ('บาร์บีคิวพลาซ่า', '{บาบีคิวพลาซ่า,bbq plaza,bar b q plaza,bar-b-q plaza,บาร์บีกอน}', 39900, '/คน', 'https://www.prachachat.net/biz-movement/news-2051540', '2026-11-13'),
  -- 399++ entry tier + 45 refill + 10% service + VAT ≈ 520 (worked out; 5 tiers 399–1,299++)
  ('Sukishi', '{ซูกิชิ,สุกิชิ}', 52000, '/คน', 'https://www.lemon8-app.com/@tong_faber/7634897953227817479?region=th', '2026-11-13'),
  -- iced latte 70–80 depending on the source
  ('Café Amazon ลาเต้เย็น', '{คาเฟ่อเมซอน,อเมซอน,cafe amazon,café amazon}', 7500, '/แก้ว', 'https://salehere.co.th/cafe-amazon/promotions/update-price-cafe-amazon', '2026-11-13'),
  -- caffè latte Tall 130 (menu round-up site, not the official menu)
  ('Starbucks ลาเต้ Tall', '{starbucks,สตาร์บัค,สตาร์บัคส์,สตาบัค}', 13000, '/แก้ว', 'https://salehere.co.th/starbucks/promotions/update-price-starbucks', '2026-11-13');
