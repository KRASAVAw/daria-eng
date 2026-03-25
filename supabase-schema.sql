create table if not exists public.daria_word_lists (  
shared_id text primary key,  
payload jsonb not null default '{}'::jsonb,  
updated_at_ms bigint not null default 0,  
created_at timestamptz not null default now(),  
updated_at timestamptz not null default now()  
);  
 
create or replace function public.set_daria_word_lists_updated_at()  
returns trigger  
language plpgsql  
as $$  
begin  
new.updated_at = now();  
return new;  
end;  
$$;  
 
drop trigger if exists daria_word_lists_set_updated_at on public.daria_word_lists;  
create trigger daria_word_lists_set_updated_at  
before update on public.daria_word_lists  
for each row execute function public.set_daria_word_lists_updated_at();  
 
alter table public.daria_word_lists disable row level security; 
