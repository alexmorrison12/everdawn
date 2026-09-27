-- Everdawn global leaderboard. Clients never touch the table: only the three functions below (security definer).
create table if not exists public.kills (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  day date not null,
  name text not null check (char_length(name) between 2 and 14 and name ~ '^[A-Za-zÀ-ÿ]+$'),
  cls text not null check (cls in ('warrior', 'mage', 'priest')),
  race text not null check (race in ('human', 'dwarf', 'orc', 'elf')),
  role text not null check (role in ('ranged', 'melee', 'heal')),
  guild text check (guild is null or char_length(guild) <= 32),
  element text not null check (element in ('ember', 'frost', 'venom', 'storm', 'shadow')),
  kill_ms int not null check (kill_ms between 120000 and 1800000),
  dps int not null check (dps between 0 and 1500),
  hps int not null check (hps between 0 and 1500),
  attempts int not null check (attempts between 1 and 99),
  deaths int not null default 0 check (deaths between 0 and 99),
  avoidable int not null default 0 check (avoidable between 0 and 10000000),
  speedrun_ms int check (speedrun_ms is null or speedrun_ms between 240000 and 86400000),
  premade boolean not null default false,
  ip_hash text
);
alter table public.kills enable row level security;
create index if not exists kills_day_kill on public.kills (day, kill_ms);
create index if not exists kills_day_role_dps on public.kills (day, role, dps desc);
create index if not exists kills_day_created on public.kills (day, created_at);

create or replace function public.submit_kill(
  p_day date, p_name text, p_cls text, p_race text, p_role text, p_guild text, p_element text,
  p_kill_ms int, p_dps int, p_hps int, p_attempts int, p_deaths int, p_avoidable int, p_speedrun_ms int, p_premade boolean
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_ip text := coalesce(split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1), 'unknown');
  v_hash text := md5(v_ip || 'everdawn-salt');
  v_recent int;
  v_rank int;
  v_first boolean;
begin
  if p_day < (now() at time zone 'utc')::date - 1 or p_day > (now() at time zone 'utc')::date + 1 then
    raise exception 'stale day';
  end if;
  select count(*) into v_recent from kills where ip_hash = v_hash and created_at > now() - interval '15 seconds';
  if v_recent > 0 then raise exception 'slow down'; end if;
  select count(*) into v_recent from kills where ip_hash = v_hash and created_at > now() - interval '1 hour';
  if v_recent >= 30 then raise exception 'rate limited'; end if;
  select not exists(select 1 from kills where day = p_day) into v_first;
  insert into kills (day, name, cls, race, role, guild, element, kill_ms, dps, hps, attempts, deaths, avoidable, speedrun_ms, premade, ip_hash)
  values (p_day, p_name, p_cls, p_race, p_role, nullif(p_guild, ''), p_element, p_kill_ms, p_dps, p_hps, p_attempts, p_deaths, p_avoidable, p_speedrun_ms, p_premade, v_hash);
  select count(*) + 1 into v_rank from kills where day = p_day and kill_ms < p_kill_ms;
  return json_build_object('ok', true, 'world_first', v_first, 'fastest_rank', v_rank);
end $$;

create or replace function public.top_kills(p_day date) returns json language sql security definer set search_path = public stable as $$
  select json_build_object(
    'first', (select coalesce(json_agg(r), '[]') from (select name, cls, race, guild, kill_ms, created_at as at from kills where day = p_day order by created_at limit 5) r),
    'fastest', (select coalesce(json_agg(r), '[]') from (select name, cls, race, guild, kill_ms, attempts from kills where day = p_day order by kill_ms limit 10) r),
    'dps', (select coalesce(json_agg(r), '[]') from (select name, cls, race, dps, kill_ms from kills where day = p_day and role <> 'heal' order by dps desc limit 10) r),
    'hps', (select coalesce(json_agg(r), '[]') from (select name, cls, race, hps, kill_ms from kills where day = p_day and role = 'heal' order by hps desc limit 10) r),
    'speedrun', (select coalesce(json_agg(r), '[]') from (select name, cls, race, speedrun_ms from kills where day = p_day and speedrun_ms is not null order by speedrun_ms limit 10) r),
    'total', (select count(*) from kills where day = p_day)
  );
$$;

create or replace function public.parse_samples(p_day date, p_role text) returns json language sql security definer set search_path = public stable as $$
  select coalesce(json_agg(v), '[]') from (
    select case when p_role = 'heal' then hps else dps end as v from kills
    where role = p_role and day >= p_day - 6
    order by created_at desc limit 1000
  ) s;
$$;

revoke all on public.kills from anon, authenticated;
grant execute on function public.submit_kill(date, text, text, text, text, text, text, int, int, int, int, int, int, int, boolean) to anon;
grant execute on function public.top_kills(date) to anon;
grant execute on function public.parse_samples(date, text) to anon;
