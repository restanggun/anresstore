select 'table' as kind,c.relname as key,jsonb_build_object('rls',c.relrowsecurity) as value
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'
union all
select 'column',c.relname||'.'||a.attname,jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid))
from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
where n.nspname='public' and c.relkind='r' and a.attnum>0 and not a.attisdropped
union all
select 'constraint',c.relname||'.'||co.conname,to_jsonb(pg_get_constraintdef(co.oid))
from pg_constraint co join pg_class c on c.oid=co.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
union all
select 'policy',tablename||'.'||policyname,jsonb_build_object('cmd',cmd,'roles',roles,'qual',qual,'check',with_check)
from pg_policies where schemaname='public'
union all
select 'function',p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
jsonb_build_object('definition',pg_get_functiondef(p.oid),'anon',has_function_privilege('anon',p.oid,'execute'),'authenticated',has_function_privilege('authenticated',p.oid,'execute'),'service_role',has_function_privilege('service_role',p.oid,'execute'))
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'
and not exists(select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
union all
select 'trigger',c.relname||'.'||t.tgname,to_jsonb(pg_get_triggerdef(t.oid))
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal
union all
select 'privilege',c.relname||'.'||r.rolname,jsonb_build_object('select',has_table_privilege(r.rolname,c.oid,'select'),'insert',has_table_privilege(r.rolname,c.oid,'insert'),'update',has_table_privilege(r.rolname,c.oid,'update'),'delete',has_table_privilege(r.rolname,c.oid,'delete'))
from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join pg_roles r
where n.nspname='public' and c.relkind='r' and r.rolname in ('anon','authenticated','service_role')
order by kind,key;
