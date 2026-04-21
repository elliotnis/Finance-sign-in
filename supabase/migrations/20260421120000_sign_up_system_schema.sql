-- Sign-up system schema (ported from MongoDB collections)
-- Apply in Supabase SQL Editor or: supabase db push

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password text not null,
  profile jsonb null
);

create table if not exists public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  tutor_email text not null,
  tutor_name text not null,
  session_type text not null,
  date text not null,
  time_slot text not null,
  location text,
  description text,
  is_registered boolean not null default false,
  registered_student text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_availability_tutor_date
  on public.availability_slots (tutor_email, date);

create index if not exists idx_availability_status
  on public.availability_slots (status, session_type, date);

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  student_email text not null,
  session_id uuid not null references public.availability_slots (id) on delete cascade,
  registration_time timestamptz not null default now(),
  status text not null default 'registered',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uniq_registration_student_session_active
  on public.registrations (student_email, session_id)
  where status = 'registered';

create index if not exists idx_registrations_student
  on public.registrations (student_email, status);

create table if not exists public.reflections (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  submitted_by text not null,
  role text not null,
  other_person_name text,
  attitude_rating text,
  meeting_content text,
  photo_base64 text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists uniq_reflection_session_submitter_role
  on public.reflections (session_id, submitted_by, role);

create index if not exists idx_reflections_session
  on public.reflections (session_id);
