alter table public.premium_orders drop constraint premium_orders_proof_image_check;
alter table public.premium_orders add constraint premium_orders_proof_image_check check (char_length(proof_image) <= 13981080);
