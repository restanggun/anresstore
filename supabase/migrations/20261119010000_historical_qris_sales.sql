begin;

-- Owner supplied, already paid QRIS sales from before the live checkout flow.
-- Keep these separate from gateway verified payments and supplier dispatch.
create table public.historical_sales (
  id bigint generated always as identity primary key,
  import_key text not null unique,
  sale_date date not null,
  payment_method text not null check (payment_method = 'qris'),
  amount bigint not null check (amount > 0),
  product_name text not null,
  variant_description text not null,
  quantity integer not null check (quantity > 0),
  source text not null default 'owner_history' check (source = 'owner_history'),
  created_at timestamptz not null default now()
);

alter table public.historical_sales enable row level security;
revoke all on public.historical_sales from public, anon, authenticated;
grant select on public.historical_sales to service_role;

insert into public.historical_sales (import_key, sale_date, payment_method, amount, product_name, variant_description, quantity) values
('owner-2026-09-27-netflix-17000','2026-09-27','qris',17000,'Netflix','1p2u sharing 1 bulan fullgar',1),
('owner-2026-10-01-zoom-15000','2026-10-01','qris',15000,'Zoom','private 14 hari',1),
('owner-2026-10-04-chatgpt-39000','2026-10-04','qris',39000,'ChatGPT','Plus sharing 8U 1 bulan',1),
('owner-2026-10-13-capcut-34000','2026-10-13','qris',34000,'CapCut','priv 1 bulan',1),
('owner-2026-10-14-capcut-45000','2026-10-14','qris',45000,'CapCut','private 1 bulan',1),
('owner-2026-10-14-canva-12000','2026-10-14','qris',12000,'Canva','sharing 1 bulan',1),
('owner-2026-10-17-claude-85000','2026-10-17','qris',85000,'Claude','sharing 7 hari',1),
('owner-2026-10-19-canva-10000','2026-10-19','qris',10000,'Canva','sharing 1 bulan',1),
('owner-2026-10-19-zoom-15000','2026-10-19','qris',15000,'Zoom','private 14 hari',1),
('owner-2026-10-25-viu-39000','2026-10-25','qris',39000,'Viu','private 6 bulan',1),
('owner-2026-10-27-chatgpt-75000','2026-10-27','qris',75000,'ChatGPT','Plus sharing 5U garansi 7 hari',1),
('owner-2026-11-02-zoom-15000','2026-11-02','qris',15000,'Zoom','private 14 hari',1),
('owner-2026-11-05-chatgpt-50000','2026-11-05','qris',50000,'ChatGPT','Plus semipriv 1 bulan',1),
('owner-2026-11-11-chatgpt-33000','2026-11-11','qris',33000,'ChatGPT','Plus sharing 1 bulan 5U gar login',1),
('owner-2026-11-11-spotify-30000','2026-11-11','qris',30000,'Spotify','indplan 2 bulan (acc seller, gar 1 bulan)',1);

commit;
