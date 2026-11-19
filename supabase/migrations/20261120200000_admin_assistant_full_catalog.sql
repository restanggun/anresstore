begin;

alter table public.admin_assistant_action_drafts
  drop constraint if exists admin_assistant_action_drafts_action_type_check;
alter table public.admin_assistant_action_drafts
  add constraint admin_assistant_action_drafts_action_type_check
  check (action_type in (
    'product_create','product_save','product_remove','product_batch',
    'task_rule_save','premium_rule_save','promotion_save','voucher_save'
  ));

commit;
