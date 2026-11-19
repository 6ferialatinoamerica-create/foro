-- Esquema completo para Supabase:
-- 1) Muro de mensajes a colaboradores/profesores
-- 2) Alumnas inscritas, dispositivos autorizados (máx. 2), alertas de IP/país y panel administrador
-- Ejecuta este script completo en el SQL Editor de tu proyecto en Supabase.

create extension if not exists pgcrypto with schema extensions;

-- =====================================================================
-- 1. MENSAJES PARA PROFESORES Y COLABORADORES
-- =====================================================================
create table if not exists public.teacher_messages (
    id uuid primary key default gen_random_uuid(),
    sender_name text not null check (char_length(trim(sender_name)) between 1 and 120),
    recipient text not null check (char_length(trim(recipient)) between 1 and 120),
    message_text text not null check (char_length(trim(message_text)) between 1 and 1500),
    created_at timestamptz not null default now()
);

create index if not exists idx_teacher_messages_created_at
    on public.teacher_messages (created_at desc);

alter table public.teacher_messages enable row level security;

drop policy if exists "Public can read teacher messages" on public.teacher_messages;
create policy "Public can read teacher messages"
    on public.teacher_messages
    for select
    to anon, authenticated
    using (true);

drop policy if exists "Public can insert teacher messages" on public.teacher_messages;
create policy "Public can insert teacher messages"
    on public.teacher_messages
    for insert
    to anon, authenticated
    with check (
        char_length(trim(sender_name)) between 1 and 120
        and char_length(trim(recipient)) between 1 and 120
        and char_length(trim(message_text)) between 1 and 1500
    );

-- =====================================================================
-- 2. CONTROL DE ALUMNAS INSCRITAS, DISPOSITIVOS E IP / PAÍS
-- =====================================================================
create table if not exists public.enrolled_students (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    full_name text not null default '',
    purchase_code text not null default '',
    classroom_password text not null default '',
    classroom_url text not null default '',
    primary_country text,
    primary_ip text,
    max_devices integer not null default 2 check (max_devices between 1 and 5),
    is_active boolean not null default true,
    needs_password_setup boolean not null default false,
    completed_class_ids jsonb not null default '[]'::jsonb,
    device_swaps_count integer not null default 0,
    device_swaps_reset_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.enrolled_students
    alter column purchase_code set default '',
    add column if not exists primary_ip text,
    add column if not exists needs_password_setup boolean not null default false,
    add column if not exists completed_class_ids jsonb not null default '[]'::jsonb,
    add column if not exists device_swaps_count integer not null default 0,
    add column if not exists device_swaps_reset_at timestamptz;

create index if not exists idx_enrolled_students_email_lower
    on public.enrolled_students (lower(email));

create table if not exists public.student_devices (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.enrolled_students(id) on delete cascade,
    device_id text not null,
    device_label text not null default 'Dispositivo',
    ip_address text not null default '',
    country_code text not null default '',
    city text not null default '',
    is_authorized boolean not null default true,
    first_seen_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    unique (student_id, device_id)
);

create index if not exists idx_student_devices_student
    on public.student_devices (student_id, is_authorized);

create table if not exists public.device_access_alerts (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.enrolled_students(id) on delete cascade,
    email text not null,
    full_name text not null default '',
    detected_devices_count integer not null default 1,
    countries_seen text[] not null default '{}',
    ips_seen text[] not null default '{}',
    attempted_device_id text not null default '',
    attempted_device_label text not null default '',
    attempted_ip text not null default '',
    attempted_country text not null default '',
    reason text not null check (reason in ('MAX_DEVICES', 'IP_MISMATCH', 'COUNTRY_MISMATCH')),
    resolved boolean not null default false,
    created_at timestamptz not null default now()
);

alter table public.device_access_alerts
    add column if not exists ips_seen text[] not null default '{}';

alter table public.device_access_alerts
    drop constraint if exists device_access_alerts_reason_check;

alter table public.device_access_alerts
    add constraint device_access_alerts_reason_check
    check (reason in ('MAX_DEVICES', 'IP_MISMATCH', 'COUNTRY_MISMATCH'));

create index if not exists idx_device_access_alerts_created
    on public.device_access_alerts (created_at desc);

create table if not exists public.admin_users (
    id uuid primary key default gen_random_uuid(),
    admin_email text not null unique,
    display_name text not null default 'Administrador',
    access_key_hash text not null,
    role text not null default 'owner' check (role in ('owner', 'support', 'teacher')),
    approval_status text not null default 'approved' check (approval_status in ('approved', 'pending')),
    must_change_password boolean not null default false,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

alter table public.admin_users
    add column if not exists role text not null default 'owner',
    add column if not exists approval_status text not null default 'approved',
    add column if not exists must_change_password boolean not null default false;

alter table public.admin_users
    drop constraint if exists admin_users_role_check;

alter table public.admin_users
    add constraint admin_users_role_check check (role in ('owner', 'support', 'teacher'));

alter table public.admin_users
    drop constraint if exists admin_users_approval_status_check;

alter table public.admin_users
    add constraint admin_users_approval_status_check check (approval_status in ('approved', 'pending'));

create table if not exists public.workshop_recordings (
    workshop_id text primary key,
    is_recording_ready boolean not null default false,
    updated_by text not null default '',
    updated_at timestamptz not null default now()
);

create table if not exists public.app_activity_logs (
    id uuid primary key default gen_random_uuid(),
    event_type text not null check (event_type in ('student_login', 'classroom_click', 'forum_question', 'forum_reply')),
    actor_email text not null default '',
    actor_name text not null default '',
    workshop_id text not null default '',
    country_code text not null default '',
    created_at timestamptz not null default now()
);

create index if not exists idx_app_activity_logs_created
    on public.app_activity_logs (created_at desc);

-- Seguridad estricta: ninguna tabla sensible se lee ni escribe directamente desde el cliente.
-- Todo acceso ocurre mediante funciones RPC SECURITY DEFINER (salvo lectura pública del estado de grabaciones).
alter table public.enrolled_students enable row level security;
alter table public.student_devices enable row level security;
alter table public.device_access_alerts enable row level security;
alter table public.admin_users enable row level security;
alter table public.workshop_recordings enable row level security;
alter table public.app_activity_logs enable row level security;

drop policy if exists "Public can read workshop recordings" on public.workshop_recordings;
create policy "Public can read workshop recordings"
    on public.workshop_recordings
    for select
    to anon, authenticated
    using (true);

-- =====================================================================
-- 3. FUNCIONES RPC PARA ALUMNAS (ACTIVACIÓN POR CORREO, MISMA IP Y PROGRESO)
-- =====================================================================
create or replace function public.check_student_email(
    p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_email text := lower(trim(coalesce(p_email, '')));
    v_student public.enrolled_students%rowtype;
begin
    if v_email = '' or position('@' in v_email) = 0 then
        return jsonb_build_object(
            'ok', false,
            'status', 'NOT_FOUND',
            'message', 'Ingresa un correo electrónico válido.'
        );
    end if;

    select *
    into v_student
    from public.enrolled_students
    where lower(email) = v_email
    limit 1;

    if not found then
        return jsonb_build_object(
            'ok', false,
            'status', 'NOT_FOUND',
            'message', 'No encontramos ese correo en la lista de alumnas inscritas. Verifica que sea el mismo correo con el que realizaste tu inscripción o contacta a coordinación.'
        );
    end if;

    if not v_student.is_active then
        return jsonb_build_object(
            'ok', false,
            'status', 'INACTIVE',
            'message', 'Tu pase se encuentra suspendido temporalmente. Contacta al equipo de soporte.'
        );
    end if;

    if v_student.needs_password_setup
       or (trim(coalesce(v_student.classroom_password, '')) = '' and trim(coalesce(v_student.purchase_code, '')) = '') then
        return jsonb_build_object(
            'ok', true,
            'status', 'NEEDS_ACTIVATION',
            'email', v_student.email,
            'fullName', v_student.full_name
        );
    end if;

    return jsonb_build_object(
        'ok', true,
        'status', 'NEEDS_PASSWORD',
        'email', v_student.email,
        'fullName', v_student.full_name
    );
end;
$$;

create or replace function public.activate_student_access(
    p_email text,
    p_new_password text,
    p_full_name text default '',
    p_device_id text default '',
    p_device_label text default 'Dispositivo',
    p_ip_address text default '',
    p_country_code text default '',
    p_city text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_email text := lower(trim(coalesce(p_email, '')));
    v_new_pass text := trim(coalesce(p_new_password, ''));
    v_full_name text := left(trim(coalesce(p_full_name, '')), 150);
    v_student public.enrolled_students%rowtype;
begin
    if v_email = '' or char_length(v_new_pass) < 4 then
        return jsonb_build_object(
            'ok', false,
            'status', 'INVALID_CREDENTIALS',
            'message', 'Ingresa una clave válida de al menos 4 caracteres para activar tu acceso.'
        );
    end if;

    select *
    into v_student
    from public.enrolled_students
    where lower(email) = v_email
    limit 1;

    if not found then
        return jsonb_build_object(
            'ok', false,
            'status', 'INVALID_CREDENTIALS',
            'message', 'No encontramos ese correo en la lista de alumnas inscritas.'
        );
    end if;

    if not v_student.is_active then
        return jsonb_build_object(
            'ok', false,
            'status', 'INACTIVE',
            'message', 'Tu pase se encuentra suspendido temporalmente. Contacta al equipo de soporte.'
        );
    end if;

    if not (
        v_student.needs_password_setup
        or (trim(coalesce(v_student.classroom_password, '')) = '' and trim(coalesce(v_student.purchase_code, '')) = '')
    ) then
        return jsonb_build_object(
            'ok', false,
            'status', 'INVALID_CREDENTIALS',
            'message', 'Este correo ya tiene una clave configurada. Ingresa tu clave actual para acceder.'
        );
    end if;

    update public.enrolled_students
    set classroom_password = v_new_pass,
        purchase_code = case when trim(coalesce(purchase_code, '')) = '' then upper(v_new_pass) else purchase_code end,
        full_name = case when trim(coalesce(full_name, '')) = '' and v_full_name <> '' then v_full_name else full_name end,
        needs_password_setup = false,
        updated_at = now()
    where id = v_student.id;

    return public.verify_student_access(
        v_email,
        v_new_pass,
        p_device_id,
        p_device_label,
        p_ip_address,
        p_country_code,
        p_city,
        true
    );
end;
$$;

drop function if exists public.verify_student_access(text, text, text, text, text, text, text);

create or replace function public.verify_student_access(
    p_email text,
    p_purchase_code text,
    p_device_id text,
    p_device_label text default 'Dispositivo',
    p_ip_address text default '',
    p_country_code text default '',
    p_city text default '',
    p_log_event boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_email text := lower(trim(coalesce(p_email, '')));
    v_raw_code text := trim(coalesce(p_purchase_code, ''));
    v_code text := upper(v_raw_code);
    v_device_id text := trim(coalesce(p_device_id, ''));
    v_device_label text := left(trim(coalesce(p_device_label, 'Dispositivo')), 120);
    v_ip text := regexp_replace(left(trim(coalesce(p_ip_address, '')), 64), '^::ffff:', '');
    v_country text := upper(left(trim(coalesce(p_country_code, '')), 8));
    v_city text := left(trim(coalesce(p_city, '')), 100);
    v_student public.enrolled_students%rowtype;
    v_device public.student_devices%rowtype;
    v_auth_count integer := 0;
    v_total_devices integer := 0;
    v_swaps_used integer := 0;
    v_remaining_swaps integer := 2;
    v_active_devices jsonb := '[]'::jsonb;
    v_countries text[] := '{}';
    v_ips text[] := '{}';
begin
    if v_ip = '::1' then
        v_ip := '127.0.0.1';
    end if;

    if v_email = '' or v_raw_code = '' or v_device_id = '' then
        return jsonb_build_object(
            'ok', false,
            'status', 'INVALID_CREDENTIALS',
            'message', 'Ingresa tu correo electrónico de compra y la clave asignada que recibiste.'
        );
    end if;

    select *
    into v_student
    from public.enrolled_students
    where lower(email) = v_email
      and (
          upper(purchase_code) = v_code
          or (trim(classroom_password) <> '' and trim(classroom_password) = v_raw_code)
      )
    limit 1;

    if not found then
        return jsonb_build_object(
            'ok', false,
            'status', 'INVALID_CREDENTIALS',
            'message', 'No encontramos ese correo o clave en la lista de alumnas registradas. Verifica tus datos o pide a coordinación registrar tu inscripción.'
        );
    end if;

    if not v_student.is_active then
        return jsonb_build_object(
            'ok', false,
            'status', 'INACTIVE',
            'message', 'Tu pase se encuentra suspendido temporalmente. Contacta al equipo de soporte.'
        );
    end if;

    -- Fija IP principal y país principal en el primer ingreso verificado
    if (v_student.primary_ip is null or trim(v_student.primary_ip) = '') and v_ip <> '' then
        update public.enrolled_students
        set primary_ip = v_ip,
            updated_at = now()
        where id = v_student.id;
        v_student.primary_ip := v_ip;
    end if;

    if (v_student.primary_country is null or trim(v_student.primary_country) = '') and v_country <> '' then
        update public.enrolled_students
        set primary_country = v_country,
            updated_at = now()
        where id = v_student.id;
        v_student.primary_country := v_country;
    end if;

    -- Nota: Ya NO bloqueamos por cambio de IP dentro del mismo país para no afectar a quienes usan datos móviles, trabajo o sufren cortes de luz.

    -- Bloqueo geográfico de respaldo si no se obtuvo IP pero sí países distintos
    if v_student.primary_country is not null
       and trim(v_student.primary_country) <> ''
       and v_country <> ''
       and upper(v_student.primary_country) <> v_country then

        insert into public.student_devices (
            student_id, device_id, device_label, ip_address, country_code, city, is_authorized
        )
        values (
            v_student.id, v_device_id, v_device_label, v_ip, v_country, v_city, false
        )
        on conflict (student_id, device_id) do update
        set device_label = excluded.device_label,
            ip_address = excluded.ip_address,
            country_code = excluded.country_code,
            city = excluded.city,
            is_authorized = false,
            last_seen_at = now();

        select count(*)::integer into v_total_devices
        from public.student_devices
        where student_id = v_student.id;

        select array_agg(distinct c)
        into v_countries
        from (
            select upper(country_code) as c from public.student_devices
            where student_id = v_student.id and trim(country_code) <> ''
            union
            select upper(v_student.primary_country) as c where trim(v_student.primary_country) <> ''
        ) sub;

        insert into public.device_access_alerts (
            student_id, email, full_name, detected_devices_count, countries_seen, ips_seen,
            attempted_device_id, attempted_device_label, attempted_ip, attempted_country, reason
        ) values (
            v_student.id, v_student.email, v_student.full_name, v_total_devices, coalesce(v_countries, '{}'),
            case when v_ip <> '' then array[v_ip] else '{}'::text[] end,
            v_device_id, v_device_label, v_ip, v_country, 'COUNTRY_MISMATCH'
        );

        return jsonb_build_object(
            'ok', false,
            'status', 'BLOCKED_GEO',
            'reason', 'COUNTRY_MISMATCH',
            'detectedDevicesCount', v_total_devices,
            'maxDevices', v_student.max_devices,
            'primaryCountry', v_student.primary_country,
            'attemptedCountry', v_country,
            'countriesSeen', coalesce(v_countries, '{}'::text[]),
            'primaryIp', coalesce(v_student.primary_ip, ''),
            'attemptedIp', v_ip,
            'message', format(
                'Alerta de seguridad: esta alumna ha ingresado en %s dispositivos y se detectó un intento desde un país distinto (%s vs %s).',
                v_total_devices, v_student.primary_country, v_country
            )
        );
    end if;

    select *
    into v_device
    from public.student_devices
    where student_id = v_student.id
      and device_id = v_device_id
    limit 1;

    select count(*)::integer
    into v_auth_count
    from public.student_devices
    where student_id = v_student.id
      and is_authorized = true;

    if found and v_device.is_authorized then
        update public.student_devices
        set device_label = v_device_label,
            ip_address = case when v_ip <> '' then v_ip else ip_address end,
            country_code = case when v_country <> '' then v_country else country_code end,
            city = case when v_city <> '' then v_city else city end,
            last_seen_at = now()
        where id = v_device.id;

        if coalesce(p_log_event, true) then
            insert into public.app_activity_logs (event_type, actor_email, actor_name, country_code)
            values (
                'student_login',
                v_student.email,
                v_student.full_name,
                coalesce(nullif(v_country, ''), coalesce(v_student.primary_country, ''))
            );
        end if;

        return jsonb_build_object(
            'ok', true,
            'status', 'VERIFIED',
            'message', 'Acceso verificado correctamente.',
            'student', jsonb_build_object(
                'studentId', v_student.id,
                'email', v_student.email,
                'fullName', v_student.full_name,
                'purchaseCode', v_student.purchase_code,
                'classroomPassword', case when trim(v_student.classroom_password) <> '' then v_student.classroom_password else v_raw_code end,
                'classroomUrl', v_student.classroom_url,
                'primaryCountry', coalesce(v_student.primary_country, v_country, ''),
                'primaryIp', coalesce(v_student.primary_ip, v_ip, ''),
                'activeDevicesCount', v_auth_count,
                'maxDevices', v_student.max_devices,
                'completedClassIds', coalesce(v_student.completed_class_ids, '[]'::jsonb)
            )
        );
    end if;

    if v_auth_count < v_student.max_devices then
        insert into public.student_devices (
            student_id, device_id, device_label, ip_address, country_code, city, is_authorized
        )
        values (
            v_student.id, v_device_id, v_device_label, v_ip, v_country, v_city, true
        )
        on conflict (student_id, device_id) do update
        set device_label = excluded.device_label,
            ip_address = excluded.ip_address,
            country_code = excluded.country_code,
            city = excluded.city,
            is_authorized = true,
            last_seen_at = now();

        if coalesce(p_log_event, true) then
            insert into public.app_activity_logs (event_type, actor_email, actor_name, country_code)
            values (
                'student_login',
                v_student.email,
                v_student.full_name,
                coalesce(nullif(v_country, ''), coalesce(v_student.primary_country, ''))
            );
        end if;

        return jsonb_build_object(
            'ok', true,
            'status', 'VERIFIED',
            'message', 'Dispositivo autorizado. Ya puedes entrar directo a ClassOnLive desde casa, datos móviles o tu trabajo.',
            'student', jsonb_build_object(
                'studentId', v_student.id,
                'email', v_student.email,
                'fullName', v_student.full_name,
                'purchaseCode', v_student.purchase_code,
                'classroomPassword', case when trim(v_student.classroom_password) <> '' then v_student.classroom_password else v_raw_code end,
                'classroomUrl', v_student.classroom_url,
                'primaryCountry', coalesce(v_student.primary_country, v_country, ''),
                'primaryIp', coalesce(v_student.primary_ip, v_ip, ''),
                'activeDevicesCount', v_auth_count + 1,
                'maxDevices', v_student.max_devices,
                'completedClassIds', coalesce(v_student.completed_class_ids, '[]'::jsonb)
            )
        );
    end if;

    -- Excedió el máximo de dispositivos personales permitidos: ofrecer auto-relevo si tiene cambios semanales disponibles
    if v_student.device_swaps_reset_at is null or now() - v_student.device_swaps_reset_at > interval '7 days' then
        v_swaps_used := 0;
    else
        v_swaps_used := greatest(0, coalesce(v_student.device_swaps_count, 0));
    end if;
    v_remaining_swaps := greatest(0, 2 - v_swaps_used);

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'deviceLabel', d.device_label,
                'lastSeenAt', d.last_seen_at
            )
            order by d.last_seen_at asc
        ),
        '[]'::jsonb
    )
    into v_active_devices
    from public.student_devices d
    where d.student_id = v_student.id
      and d.is_authorized = true;

    insert into public.student_devices (
        student_id, device_id, device_label, ip_address, country_code, city, is_authorized
    )
    values (
        v_student.id, v_device_id, v_device_label, v_ip, v_country, v_city, false
    )
    on conflict (student_id, device_id) do update
    set device_label = excluded.device_label,
        ip_address = excluded.ip_address,
        country_code = excluded.country_code,
        city = excluded.city,
        is_authorized = false,
        last_seen_at = now();

    select count(*)::integer into v_total_devices
    from public.student_devices
    where student_id = v_student.id;

    select array_agg(distinct c)
    into v_countries
    from (
        select upper(country_code) as c from public.student_devices
        where student_id = v_student.id and trim(country_code) <> ''
        union
        select upper(v_student.primary_country) as c where v_student.primary_country is not null and trim(v_student.primary_country) <> ''
    ) sub;

    select array_agg(distinct ip_val)
    into v_ips
    from (
        select trim(ip_address) as ip_val from public.student_devices
        where student_id = v_student.id and trim(ip_address) <> ''
        union
        select trim(v_student.primary_ip) as ip_val where v_student.primary_ip is not null and trim(v_student.primary_ip) <> ''
    ) sub_ip;

    if v_remaining_swaps <= 0 then
        insert into public.device_access_alerts (
            student_id, email, full_name, detected_devices_count, countries_seen, ips_seen,
            attempted_device_id, attempted_device_label, attempted_ip, attempted_country, reason
        ) values (
            v_student.id, v_student.email, v_student.full_name, v_total_devices, coalesce(v_countries, '{}'), coalesce(v_ips, '{}'),
            v_device_id, v_device_label, v_ip, v_country, 'MAX_DEVICES'
        );
    end if;

    return jsonb_build_object(
        'ok', false,
        'status', 'BLOCKED_MAX_DEVICES',
        'reason', 'MAX_DEVICES',
        'detectedDevicesCount', v_auth_count,
        'maxDevices', v_student.max_devices,
        'canSelfReplace', v_remaining_swaps > 0,
        'remainingReplacements', v_remaining_swaps,
        'activeDevices', v_active_devices,
        'primaryCountry', coalesce(v_student.primary_country, ''),
        'attemptedCountry', v_country,
        'countriesSeen', coalesce(v_countries, '{}'::text[]),
        'primaryIp', coalesce(v_student.primary_ip, ''),
        'attemptedIp', v_ip,
        'ipsSeen', coalesce(v_ips, '{}'::text[]),
        'message', case
            when v_remaining_swaps > 0 then format(
                'Tu pase ya está activo en %s equipos personales. Para proteger tu cuenta, puedes reemplazar el equipo más antiguo con 1 clic y entrar desde este dispositivo.',
                v_student.max_devices
            )
            else format(
                'Ya utilizaste tus cambios de equipo de esta semana y alcanzaste el límite de %s dispositivos. Escríbenos a soporte para restablecer tus accesos.',
                v_student.max_devices
            )
        end
    );
end;
$$;

create or replace function public.replace_student_device(
    p_email text,
    p_purchase_code text,
    p_device_id text,
    p_device_label text default 'Dispositivo',
    p_ip_address text default '',
    p_country_code text default '',
    p_city text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_email text := lower(trim(coalesce(p_email, '')));
    v_raw_code text := trim(coalesce(p_purchase_code, ''));
    v_code text := upper(v_raw_code);
    v_device_id text := trim(coalesce(p_device_id, ''));
    v_device_label text := left(trim(coalesce(p_device_label, 'Dispositivo')), 120);
    v_ip text := regexp_replace(left(trim(coalesce(p_ip_address, '')), 64), '^::ffff:', '');
    v_country text := upper(left(trim(coalesce(p_country_code, '')), 8));
    v_city text := left(trim(coalesce(p_city, '')), 100);
    v_student public.enrolled_students%rowtype;
    v_swaps_used integer := 0;
    v_reset_at timestamptz;
    v_oldest_device_id uuid;
    v_auth_count integer := 0;
begin
    if v_ip = '::1' then
        v_ip := '127.0.0.1';
    end if;

    if v_email = '' or v_raw_code = '' or v_device_id = '' then
        return jsonb_build_object(
            'ok', false,
            'status', 'INVALID_CREDENTIALS',
            'message', 'Ingresa tu correo electrónico de compra y tu clave de acceso para activar este equipo.'
        );
    end if;

    select *
    into v_student
    from public.enrolled_students
    where lower(email) = v_email
      and (
          upper(purchase_code) = v_code
          or (trim(classroom_password) <> '' and trim(classroom_password) = v_raw_code)
      )
    limit 1;

    if not found then
        return jsonb_build_object(
            'ok', false,
            'status', 'INVALID_CREDENTIALS',
            'message', 'Tus datos de correo o clave no coinciden con tu inscripción.'
        );
    end if;

    if not v_student.is_active then
        return jsonb_build_object(
            'ok', false,
            'status', 'INACTIVE',
            'message', 'Tu pase se encuentra suspendido temporalmente. Contacta al equipo de soporte.'
        );
    end if;

    if v_student.primary_country is not null
       and trim(v_student.primary_country) <> ''
       and v_country <> ''
       and upper(v_student.primary_country) <> v_country then
        return jsonb_build_object(
            'ok', false,
            'status', 'BLOCKED_GEO',
            'reason', 'COUNTRY_MISMATCH',
            'primaryCountry', v_student.primary_country,
            'attemptedCountry', v_country,
            'message', format(
                'Por seguridad, detectamos este intento desde un país distinto al de tu registro (%s vs %s). Escríbenos a soporte si estás de viaje.',
                v_student.primary_country, v_country
            )
        );
    end if;

    if v_student.device_swaps_reset_at is null or now() - v_student.device_swaps_reset_at > interval '7 days' then
        v_swaps_used := 0;
        v_reset_at := now();
    else
        v_swaps_used := greatest(0, coalesce(v_student.device_swaps_count, 0));
        v_reset_at := v_student.device_swaps_reset_at;
    end if;

    if v_swaps_used >= 2 then
        return jsonb_build_object(
            'ok', false,
            'status', 'BLOCKED_MAX_DEVICES',
            'reason', 'MAX_DEVICES',
            'maxDevices', v_student.max_devices,
            'canSelfReplace', false,
            'remainingReplacements', 0,
            'message', 'Ya utilizaste tus 2 cambios rápidos de equipo de esta semana. Contacta a soporte para restablecer tus dispositivos.'
        );
    end if;

    if not exists (
        select 1 from public.student_devices
        where student_id = v_student.id and device_id = v_device_id and is_authorized = true
    ) then
        select id into v_oldest_device_id
        from public.student_devices
        where student_id = v_student.id
          and is_authorized = true
        order by last_seen_at asc, first_seen_at asc
        limit 1;

        if v_oldest_device_id is not null then
            update public.student_devices
            set is_authorized = false
            where id = v_oldest_device_id;
        end if;

        insert into public.student_devices (
            student_id, device_id, device_label, ip_address, country_code, city, is_authorized
        )
        values (
            v_student.id, v_device_id, v_device_label, v_ip, v_country, v_city, true
        )
        on conflict (student_id, device_id) do update
        set device_label = excluded.device_label,
            ip_address = excluded.ip_address,
            country_code = excluded.country_code,
            city = excluded.city,
            is_authorized = true,
            last_seen_at = now();

        update public.enrolled_students
        set device_swaps_count = v_swaps_used + 1,
            device_swaps_reset_at = v_reset_at,
            updated_at = now()
        where id = v_student.id;

        insert into public.app_activity_logs (event_type, actor_email, actor_name, country_code)
        values (
            'student_login',
            v_student.email,
            v_student.full_name,
            coalesce(nullif(v_country, ''), coalesce(v_student.primary_country, ''))
        );
    end if;

    select count(*)::integer into v_auth_count
    from public.student_devices
    where student_id = v_student.id and is_authorized = true;

    return jsonb_build_object(
        'ok', true,
        'status', 'VERIFIED',
        'message', '¡Listo! Activamos este equipo como parte de tus dispositivos autorizados.',
        'student', jsonb_build_object(
            'studentId', v_student.id,
            'email', v_student.email,
            'fullName', v_student.full_name,
            'purchaseCode', v_student.purchase_code,
            'classroomPassword', case when trim(v_student.classroom_password) <> '' then v_student.classroom_password else v_raw_code end,
            'classroomUrl', v_student.classroom_url,
            'primaryCountry', coalesce(v_student.primary_country, v_country, ''),
            'primaryIp', coalesce(v_student.primary_ip, v_ip, ''),
            'activeDevicesCount', v_auth_count,
            'maxDevices', v_student.max_devices,
            'completedClassIds', coalesce(v_student.completed_class_ids, '[]'::jsonb)
        )
    );
end;
$$;

create or replace function public.save_student_classroom_credentials(
    p_email text,
    p_purchase_code text,
    p_device_id text,
    p_classroom_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_email text := lower(trim(coalesce(p_email, '')));
    v_raw_code text := trim(coalesce(p_purchase_code, ''));
    v_code text := upper(v_raw_code);
    v_device_id text := trim(coalesce(p_device_id, ''));
    v_student_id uuid;
begin
    select s.id
    into v_student_id
    from public.enrolled_students s
    join public.student_devices d on d.student_id = s.id
    where lower(s.email) = v_email
      and (
          upper(s.purchase_code) = v_code
          or (trim(s.classroom_password) <> '' and trim(s.classroom_password) = v_raw_code)
      )
      and s.is_active = true
      and d.device_id = v_device_id
      and d.is_authorized = true
    limit 1;

    if not found then
        return jsonb_build_object('ok', false, 'message', 'Dispositivo no autorizado.');
    end if;

    update public.enrolled_students
    set classroom_password = coalesce(p_classroom_password, ''),
        updated_at = now()
    where id = v_student_id;

    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.save_student_progress(
    p_email text,
    p_purchase_code text,
    p_device_id text,
    p_completed_class_ids jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_email text := lower(trim(coalesce(p_email, '')));
    v_raw_code text := trim(coalesce(p_purchase_code, ''));
    v_code text := upper(v_raw_code);
    v_device_id text := trim(coalesce(p_device_id, ''));
    v_student_id uuid;
    v_progress jsonb := coalesce(p_completed_class_ids, '[]'::jsonb);
begin
    if jsonb_typeof(v_progress) <> 'array' then
        v_progress := '[]'::jsonb;
    end if;

    select s.id
    into v_student_id
    from public.enrolled_students s
    join public.student_devices d on d.student_id = s.id
    where lower(s.email) = v_email
      and (
          upper(s.purchase_code) = v_code
          or (trim(s.classroom_password) <> '' and trim(s.classroom_password) = v_raw_code)
      )
      and s.is_active = true
      and d.device_id = v_device_id
      and d.is_authorized = true
    limit 1;

    if not found then
        return jsonb_build_object('ok', false, 'message', 'Dispositivo no autorizado.');
    end if;

    update public.enrolled_students
    set completed_class_ids = v_progress,
        updated_at = now()
    where id = v_student_id;

    return jsonb_build_object('ok', true, 'completedClassIds', v_progress);
end;
$$;

create or replace function public.log_student_activity(
    p_email text default '',
    p_actor_name text default '',
    p_event_type text default 'classroom_click',
    p_workshop_id text default '',
    p_country_code text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_event text := trim(coalesce(p_event_type, 'classroom_click'));
    v_country text := upper(left(trim(coalesce(p_country_code, '')), 8));
begin
    if v_event not in ('student_login', 'classroom_click') then
        return jsonb_build_object('ok', false, 'message', 'Tipo de evento no válido.');
    end if;

    insert into public.app_activity_logs (event_type, actor_email, actor_name, workshop_id, country_code)
    values (
        v_event,
        lower(left(trim(coalesce(p_email, '')), 160)),
        left(trim(coalesce(p_actor_name, '')), 150),
        left(trim(coalesce(p_workshop_id, '')), 64),
        v_country
    );

    return jsonb_build_object('ok', true);
end;
$$;

-- =====================================================================
-- 4. FUNCIONES RPC PARA EL PANEL DE ADMINISTRADOR (ROLES Y CLAVE TEMPORAL)
-- =====================================================================
create or replace function public.is_valid_admin(
    p_admin_email text,
    p_access_key text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_email text := lower(trim(coalesce(p_admin_email, '')));
    v_key text := trim(coalesce(p_access_key, ''));
    v_user public.admin_users%rowtype;
begin
    if v_email = '' or v_key = '' then
        return false;
    end if;

    select *
    into v_user
    from public.admin_users
    where lower(admin_email) = v_email
      and is_active = true
      and coalesce(approval_status, 'approved') = 'approved'
      and must_change_password = false
    limit 1;

    if not found then
        return false;
    end if;

    return v_user.access_key_hash = extensions.crypt(v_key, v_user.access_key_hash);
end;
$$;

create or replace function public.is_valid_owner_admin(
    p_admin_email text,
    p_access_key text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_email text := lower(trim(coalesce(p_admin_email, '')));
    v_key text := trim(coalesce(p_access_key, ''));
    v_user public.admin_users%rowtype;
begin
    if v_email = '' or v_key = '' then
        return false;
    end if;

    select *
    into v_user
    from public.admin_users
    where lower(admin_email) = v_email
      and is_active = true
      and coalesce(approval_status, 'approved') = 'approved'
      and role = 'owner'
      and must_change_password = false
    limit 1;

    if not found then
        return false;
    end if;

    return v_user.access_key_hash = extensions.crypt(v_key, v_user.access_key_hash);
end;
$$;

create or replace function public.is_valid_support_or_owner(
    p_admin_email text,
    p_access_key text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_email text := lower(trim(coalesce(p_admin_email, '')));
    v_key text := trim(coalesce(p_access_key, ''));
    v_user public.admin_users%rowtype;
begin
    if v_email = '' or v_key = '' then
        return false;
    end if;

    select *
    into v_user
    from public.admin_users
    where lower(admin_email) = v_email
      and is_active = true
      and coalesce(approval_status, 'approved') = 'approved'
      and role in ('owner', 'support')
      and must_change_password = false
    limit 1;

    if not found then
        return false;
    end if;

    return v_user.access_key_hash = extensions.crypt(v_key, v_user.access_key_hash);
end;
$$;

create or replace function public.verify_admin_access(
    p_admin_email text,
    p_access_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_email text := lower(trim(coalesce(p_admin_email, '')));
    v_key text := trim(coalesce(p_access_key, ''));
    v_user public.admin_users%rowtype;
begin
    if v_email = '' or v_key = '' then
        return jsonb_build_object(
            'ok', false,
            'message', 'Ingresa tu correo y clave de administrador.'
        );
    end if;

    select *
    into v_user
    from public.admin_users
    where lower(admin_email) = v_email
      and is_active = true
    limit 1;

    if not found or v_user.access_key_hash <> extensions.crypt(v_key, v_user.access_key_hash) then
        return jsonb_build_object(
            'ok', false,
            'message', 'Correo o clave de acceso incorrectos. Si eres organizador/a con clave temporal o colaboradora aprobada, verifica tus datos.'
        );
    end if;

    if coalesce(v_user.approval_status, 'approved') = 'pending' then
        return jsonb_build_object(
            'ok', false,
            'pendingApproval', true,
            'message', 'Tu solicitud de colaboradora aún está pendiente de aprobación por un organizador de la feria.'
        );
    end if;

    return jsonb_build_object(
        'ok', true,
        'adminId', v_user.id,
        'displayName', coalesce(v_user.display_name, 'Administrador'),
        'email', v_email,
        'role', coalesce(v_user.role, 'owner'),
        'requiresPasswordChange', coalesce(v_user.must_change_password, false)
    );
end;
$$;

create or replace function public.admin_change_password(
    p_admin_email text,
    p_current_key text,
    p_new_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_email text := lower(trim(coalesce(p_admin_email, '')));
    v_cur_key text := trim(coalesce(p_current_key, ''));
    v_new_key text := trim(coalesce(p_new_key, ''));
    v_user public.admin_users%rowtype;
begin
    if v_email = '' or v_cur_key = '' then
        return jsonb_build_object('ok', false, 'message', 'Credenciales inválidas.');
    end if;

    if char_length(v_new_key) < 4 then
        return jsonb_build_object('ok', false, 'message', 'La nueva contraseña debe tener al menos 4 caracteres.');
    end if;

    if v_new_key = v_cur_key or v_new_key = '1234' then
        return jsonb_build_object('ok', false, 'message', 'Elige una contraseña personal distinta a la clave temporal (1234).');
    end if;

    select *
    into v_user
    from public.admin_users
    where lower(admin_email) = v_email
      and is_active = true
      and coalesce(approval_status, 'approved') = 'approved'
    limit 1;

    if not found or v_user.access_key_hash <> extensions.crypt(v_cur_key, v_user.access_key_hash) then
        return jsonb_build_object('ok', false, 'message', 'La clave temporal o contraseña actual es incorrecta.');
    end if;

    update public.admin_users
    set access_key_hash = extensions.crypt(v_new_key, extensions.gen_salt('bf')),
        must_change_password = false
    where id = v_user.id;

    return jsonb_build_object(
        'ok', true,
        'adminId', v_user.id,
        'email', v_email,
        'displayName', coalesce(v_user.display_name, 'Administrador'),
        'role', coalesce(v_user.role, 'owner'),
        'requiresPasswordChange', false,
        'message', 'Contraseña actualizada correctamente.'
    );
end;
$$;

drop function if exists public.admin_register_user(text, text, text, text, text);

create or replace function public.admin_register_user(
    p_admin_email text,
    p_access_key text,
    p_display_name text default 'Administrador',
    p_requester_email text default '',
    p_requester_key text default '',
    p_role text default 'owner',
    p_must_change_password boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_email text := lower(trim(coalesce(p_admin_email, '')));
    v_key text := trim(coalesce(p_access_key, ''));
    v_name text := left(coalesce(nullif(trim(p_display_name), ''), 'Administrador'), 120);
    v_req_email text := lower(trim(coalesce(p_requester_email, '')));
    v_req_key text := trim(coalesce(p_requester_key, ''));
    v_role text := case
        when lower(trim(coalesce(p_role, 'owner'))) = 'teacher' then 'teacher'
        when lower(trim(coalesce(p_role, 'owner'))) = 'support' then 'support'
        else 'owner'
    end;
    v_must_change boolean := coalesce(p_must_change_password, false);
    v_real_admins_count integer := 0;
    v_saved_id uuid;
begin
    if v_email = '' or position('@' in v_email) = 0 or char_length(v_key) < 4 then
        return jsonb_build_object(
            'ok', false,
            'message', 'Ingresa un correo válido y una clave de al menos 4 caracteres.'
        );
    end if;

    select count(*)::integer
    into v_real_admins_count
    from public.admin_users
    where is_active = true
      and coalesce(approval_status, 'approved') = 'approved'
      and role = 'owner'
      and not (
          lower(admin_email) = 'admin@territoriocanva.com'
          and access_key_hash = extensions.crypt('CAMBIA-ESTA-CLAVE-SEGURA', access_key_hash)
      );

    -- Si ya existe al menos un organizador activo, requiere autorización de un organizador vigente
    if v_real_admins_count > 0 then
        if not public.is_valid_owner_admin(v_req_email, v_req_key) then
            return jsonb_build_object(
                'ok', false,
                'message', 'Solo un organizador de la feria activo puede registrar nuevos administradores o profesores. Si ingresas con clave temporal (1234), usa "Iniciar sesión".'
            );
        end if;
    else
        delete from public.admin_users
        where lower(admin_email) = 'admin@territoriocanva.com'
          and lower(admin_email) <> v_email
          and access_key_hash = extensions.crypt('CAMBIA-ESTA-CLAVE-SEGURA', access_key_hash);
        v_role := 'owner';
    end if;

    insert into public.admin_users (admin_email, display_name, access_key_hash, role, approval_status, must_change_password, is_active)
    values (
        v_email,
        v_name,
        extensions.crypt(v_key, extensions.gen_salt('bf')),
        v_role,
        'approved',
        v_must_change,
        true
    )
    on conflict (admin_email) do update
    set display_name = excluded.display_name,
        access_key_hash = excluded.access_key_hash,
        role = excluded.role,
        approval_status = 'approved',
        must_change_password = excluded.must_change_password,
        is_active = true
    returning id into v_saved_id;

    return jsonb_build_object(
        'ok', true,
        'adminId', v_saved_id,
        'email', v_email,
        'displayName', v_name,
        'role', v_role,
        'mustChangePassword', v_must_change,
        'message', 'Cuenta registrada correctamente.'
    );
end;
$$;

create or replace function public.request_collaborator_access(
    p_email text,
    p_access_key text,
    p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_email text := lower(trim(coalesce(p_email, '')));
    v_key text := trim(coalesce(p_access_key, ''));
    v_name text := left(trim(coalesce(p_display_name, '')), 120);
    v_existing public.admin_users%rowtype;
begin
    if v_name = '' or v_email = '' or position('@' in v_email) = 0 or char_length(v_key) < 4 then
        return jsonb_build_object(
            'ok', false,
            'message', 'Ingresa tu nombre completo, correo válido y una clave de al menos 4 caracteres.'
        );
    end if;

    select *
    into v_existing
    from public.admin_users
    where lower(admin_email) = v_email
    limit 1;

    if found then
        if v_existing.is_active and coalesce(v_existing.approval_status, 'approved') = 'approved' then
            return jsonb_build_object(
                'ok', false,
                'message', 'Este correo ya tiene acceso aprobado en la app. Usa la pestaña "Iniciar sesión".'
            );
        end if;

        update public.admin_users
        set display_name = v_name,
            access_key_hash = extensions.crypt(v_key, extensions.gen_salt('bf')),
            role = 'teacher',
            approval_status = 'pending',
            must_change_password = false,
            is_active = true
        where id = v_existing.id;

        return jsonb_build_object(
            'ok', true,
            'pending', true,
            'message', 'Actualizamos tu solicitud de colaboradora. Queda pendiente de aprobación por un organizador de la feria.'
        );
    end if;

    insert into public.admin_users (
        admin_email, display_name, access_key_hash, role, approval_status, must_change_password, is_active
    ) values (
        v_email,
        v_name,
        extensions.crypt(v_key, extensions.gen_salt('bf')),
        'teacher',
        'pending',
        false,
        true
    );

    return jsonb_build_object(
        'ok', true,
        'pending', true,
        'message', '¡Solicitud enviada! Un organizador de la feria aprobará tu perfil para que puedas responder dudas en el foro.'
    );
end;
$$;

create or replace function public.admin_review_collaborator(
    p_admin_email text,
    p_access_key text,
    p_target_admin_id uuid,
    p_approve boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
    if not public.is_valid_owner_admin(p_admin_email, p_access_key) then
        return jsonb_build_object('ok', false, 'message', 'Solo los organizadores de la feria pueden aprobar o rechazar colaboradoras.');
    end if;

    if coalesce(p_approve, false) then
        update public.admin_users
        set approval_status = 'approved',
            is_active = true
        where id = p_target_admin_id;
        return jsonb_build_object('ok', true, 'approved', true);
    else
        delete from public.admin_users
        where id = p_target_admin_id
          and coalesce(approval_status, 'approved') = 'pending';
        return jsonb_build_object('ok', true, 'approved', false);
    end if;
end;
$$;

create or replace function public.admin_delete_user(
    p_admin_email text,
    p_access_key text,
    p_target_admin_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_target public.admin_users%rowtype;
    v_remaining_owners integer := 0;
    v_is_self boolean := false;
begin
    if not public.is_valid_owner_admin(p_admin_email, p_access_key) then
        return jsonb_build_object('ok', false, 'message', 'Solo los organizadores de la feria pueden eliminar cuentas administrativas.');
    end if;

    select * into v_target
    from public.admin_users
    where id = p_target_admin_id;

    if not found then
        return jsonb_build_object('ok', false, 'message', 'No encontramos la cuenta indicada.');
    end if;

    v_is_self := (lower(v_target.admin_email) = lower(trim(p_admin_email)));

    if v_target.role = 'owner' and coalesce(v_target.approval_status, 'approved') = 'approved' then
        select count(*)::integer into v_remaining_owners
        from public.admin_users
        where id <> p_target_admin_id
          and is_active = true
          and coalesce(approval_status, 'approved') = 'approved'
          and role = 'owner';

        if v_remaining_owners < 1 then
            return jsonb_build_object(
                'ok', false,
                'message', 'Debe quedar al menos un organizador activo en la plataforma antes de eliminar este perfil.'
            );
        end if;
    end if;

    delete from public.admin_users where id = p_target_admin_id;
    return jsonb_build_object('ok', true, 'selfDeleted', v_is_self);
end;
$$;

create or replace function public.admin_update_user_role(
    p_admin_email text,
    p_access_key text,
    p_target_admin_id uuid,
    p_new_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_target public.admin_users%rowtype;
    v_clean_role text := case
        when lower(trim(coalesce(p_new_role, 'owner'))) = 'teacher' then 'teacher'
        when lower(trim(coalesce(p_new_role, 'owner'))) = 'support' then 'support'
        else 'owner'
    end;
    v_remaining_owners integer := 0;
begin
    if not public.is_valid_owner_admin(p_admin_email, p_access_key) then
        return jsonb_build_object('ok', false, 'message', 'Solo los organizadores de la feria pueden cambiar roles administrativos.');
    end if;

    select * into v_target
    from public.admin_users
    where id = p_target_admin_id;

    if not found then
        return jsonb_build_object('ok', false, 'message', 'No encontramos la cuenta indicada.');
    end if;

    if v_target.role = 'owner' and v_clean_role <> 'owner' and coalesce(v_target.approval_status, 'approved') = 'approved' then
        select count(*)::integer into v_remaining_owners
        from public.admin_users
        where id <> p_target_admin_id
          and is_active = true
          and coalesce(approval_status, 'approved') = 'approved'
          and role = 'owner';

        if v_remaining_owners < 1 then
            return jsonb_build_object(
                'ok', false,
                'message', 'Debe quedar al menos un organizador activo en la plataforma antes de cambiar este rol.'
            );
        end if;
    end if;

    update public.admin_users
    set role = v_clean_role
    where id = p_target_admin_id;

    return jsonb_build_object('ok', true, 'role', v_clean_role);
end;
$$;

create or replace function public.admin_toggle_workshop_recording(
    p_admin_email text,
    p_access_key text,
    p_workshop_id text,
    p_is_ready boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_email text := lower(trim(coalesce(p_admin_email, '')));
    v_workshop_id text := trim(coalesce(p_workshop_id, ''));
    v_ready boolean := coalesce(p_is_ready, false);
begin
    if not public.is_valid_support_or_owner(v_email, p_access_key) then
        return jsonb_build_object('ok', false, 'message', 'Solo organizadores o soporte pueden actualizar el estado de grabaciones.');
    end if;

    if v_workshop_id = '' then
        return jsonb_build_object('ok', false, 'message', 'Taller no válido.');
    end if;

    insert into public.workshop_recordings (workshop_id, is_recording_ready, updated_by, updated_at)
    values (v_workshop_id, v_ready, v_email, now())
    on conflict (workshop_id) do update
    set is_recording_ready = excluded.is_recording_ready,
        updated_by = excluded.updated_by,
        updated_at = now();

    return jsonb_build_object('ok', true, 'workshopId', v_workshop_id, 'isRecordingReady', v_ready);
end;
$$;

create or replace function public.admin_list_dashboard(
    p_admin_email text,
    p_access_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_email text := lower(trim(coalesce(p_admin_email, '')));
    v_caller public.admin_users%rowtype;
    v_role text := 'owner';
    v_students jsonb := '[]'::jsonb;
    v_alerts jsonb := '[]'::jsonb;
    v_admins jsonb := '[]'::jsonb;
    v_recordings jsonb := '{}'::jsonb;
    v_activity_logs jsonb := '[]'::jsonb;
begin
    if not public.is_valid_admin(v_email, p_access_key) then
        return jsonb_build_object('ok', false, 'message', 'Acceso no autorizado o pendiente cambio de clave temporal.');
    end if;

    select * into v_caller
    from public.admin_users
    where lower(admin_email) = v_email
    limit 1;

    v_role := coalesce(v_caller.role, 'owner');

    if v_role in ('owner', 'support') then
        select coalesce(jsonb_agg(row_to_json(s_data) order by s_data."createdAt" desc), '[]'::jsonb)
        into v_students
        from (
            select
                s.id,
                s.email,
                s.full_name as "fullName",
                s.purchase_code as "purchaseCode",
                s.classroom_password as "classroomPassword",
                s.classroom_url as "classroomUrl",
                s.primary_country as "primaryCountry",
                s.primary_ip as "primaryIp",
                s.max_devices as "maxDevices",
                s.is_active as "isActive",
                coalesce(s.needs_password_setup, false) as "needsPasswordSetup",
                coalesce(s.completed_class_ids, '[]'::jsonb) as "completedClassIds",
                s.created_at as "createdAt",
                (select count(*)::integer from public.student_devices d where d.student_id = s.id and d.is_authorized = true) as "authorizedDevicesCount",
                (select count(*)::integer from public.student_devices d where d.student_id = s.id) as "totalDevicesCount"
            from public.enrolled_students s
        ) s_data;

        select coalesce(jsonb_agg(row_to_json(a_data) order by a_data."createdAt" desc), '[]'::jsonb)
        into v_alerts
        from (
            select
                a.id,
                a.student_id as "studentId",
                a.email,
                a.full_name as "fullName",
                a.detected_devices_count as "detectedDevicesCount",
                a.countries_seen as "countriesSeen",
                coalesce(a.ips_seen, '{}'::text[]) as "ipsSeen",
                a.attempted_device_label as "attemptedDeviceLabel",
                a.attempted_ip as "attemptedIp",
                a.attempted_country as "attemptedCountry",
                a.reason,
                a.resolved,
                a.created_at as "createdAt"
            from public.device_access_alerts a
            limit 100
        ) a_data;

        select coalesce(jsonb_object_agg(r.workshop_id, r.is_recording_ready), '{}'::jsonb)
        into v_recordings
        from public.workshop_recordings r;
    end if;

    if v_role = 'owner' then
        select coalesce(jsonb_agg(row_to_json(adm_data) order by adm_data."createdAt" asc), '[]'::jsonb)
        into v_admins
        from (
            select
                u.id,
                u.admin_email as "adminEmail",
                u.display_name as "displayName",
                coalesce(u.role, 'owner') as "role",
                coalesce(u.approval_status, 'approved') as "approvalStatus",
                coalesce(u.must_change_password, false) as "mustChangePassword",
                u.is_active as "isActive",
                u.created_at as "createdAt"
            from public.admin_users u
            where u.is_active = true
        ) adm_data;

        select coalesce(jsonb_agg(row_to_json(log_data) order by log_data."createdAt" desc), '[]'::jsonb)
        into v_activity_logs
        from (
            select
                l.id,
                l.event_type as "eventType",
                l.actor_email as "actorEmail",
                l.actor_name as "actorName",
                l.workshop_id as "workshopId",
                l.country_code as "countryCode",
                l.created_at as "createdAt"
            from public.app_activity_logs l
            order by l.created_at desc
            limit 500
        ) log_data;
    end if;

    return jsonb_build_object(
        'ok', true,
        'adminId', v_caller.id,
        'role', v_role,
        'students', v_students,
        'alerts', v_alerts,
        'admins', v_admins,
        'recordings', v_recordings,
        'activityLogs', v_activity_logs
    );
end;
$$;

create or replace function public.admin_upsert_student(
    p_admin_email text,
    p_access_key text,
    p_email text,
    p_purchase_code text default '',
    p_full_name text default '',
    p_classroom_password text default '',
    p_classroom_url text default '',
    p_max_devices integer default 2,
    p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_email text := lower(trim(coalesce(p_email, '')));
    v_raw_pass text := trim(coalesce(p_classroom_password, ''));
    v_raw_code text := trim(coalesce(p_purchase_code, ''));
    v_effective_code text := upper(coalesce(nullif(v_raw_code, ''), v_raw_pass, ''));
    v_effective_pass text := coalesce(nullif(v_raw_pass, ''), v_raw_code, '');
    v_needs_setup boolean := (v_effective_code = '' and v_effective_pass = '');
begin
    if not public.is_valid_support_or_owner(p_admin_email, p_access_key) then
        return jsonb_build_object('ok', false, 'message', 'Solo organizadores o soporte pueden registrar o modificar alumnas.');
    end if;

    if v_email = '' or position('@' in v_email) = 0 then
        return jsonb_build_object('ok', false, 'message', 'El correo electrónico de la alumna es obligatorio.');
    end if;

    insert into public.enrolled_students (
        email, full_name, purchase_code, classroom_password, classroom_url, max_devices, is_active, needs_password_setup
    ) values (
        v_email,
        trim(coalesce(p_full_name, '')),
        v_effective_code,
        v_effective_pass,
        trim(coalesce(p_classroom_url, '')),
        greatest(1, least(5, coalesce(p_max_devices, 2))),
        coalesce(p_is_active, true),
        v_needs_setup
    )
    on conflict (email) do update
    set full_name = case when trim(excluded.full_name) <> '' then excluded.full_name else public.enrolled_students.full_name end,
        purchase_code = case when excluded.purchase_code <> '' then excluded.purchase_code else public.enrolled_students.purchase_code end,
        classroom_password = case when excluded.classroom_password <> '' then excluded.classroom_password else public.enrolled_students.classroom_password end,
        classroom_url = case when excluded.classroom_url <> '' then excluded.classroom_url else public.enrolled_students.classroom_url end,
        needs_password_setup = case
            when excluded.classroom_password <> '' or excluded.purchase_code <> '' then false
            else public.enrolled_students.needs_password_setup
        end,
        max_devices = excluded.max_devices,
        is_active = excluded.is_active,
        updated_at = now();

    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_reset_student_devices(
    p_admin_email text,
    p_access_key text,
    p_student_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
    if not public.is_valid_support_or_owner(p_admin_email, p_access_key) then
        return jsonb_build_object('ok', false, 'message', 'Solo organizadores o soporte pueden restablecer dispositivos.');
    end if;

    delete from public.student_devices where student_id = p_student_id;

    update public.enrolled_students
    set primary_country = null,
        primary_ip = null,
        updated_at = now()
    where id = p_student_id;

    update public.device_access_alerts
    set resolved = true
    where student_id = p_student_id;

    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_delete_student(
    p_admin_email text,
    p_access_key text,
    p_student_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
    if not public.is_valid_owner_admin(p_admin_email, p_access_key) then
        return jsonb_build_object('ok', false, 'message', 'Solo los organizadores de la feria pueden eliminar alumnas.');
    end if;

    delete from public.enrolled_students where id = p_student_id;
    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_upsert_students_bulk(
    p_admin_email text,
    p_access_key text,
    p_students jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_item jsonb;
    v_email text;
    v_raw_code text;
    v_raw_pass text;
    v_code text;
    v_pass text;
    v_needs_setup boolean;
    v_imported integer := 0;
begin
    if not public.is_valid_support_or_owner(p_admin_email, p_access_key) then
        return jsonb_build_object('ok', false, 'message', 'Solo organizadores o soporte pueden subir listados CSV / XLSX.');
    end if;

    if p_students is null or jsonb_typeof(p_students) <> 'array' then
        return jsonb_build_object('ok', false, 'message', 'Formato de lista inválido.');
    end if;

    for v_item in select * from jsonb_array_elements(p_students)
    loop
        v_email := lower(trim(coalesce(v_item->>'email', '')));
        if v_email = '' or position('@' in v_email) = 0 then
            continue;
        end if;

        v_raw_code := trim(coalesce(v_item->>'purchaseCode', ''));
        v_raw_pass := trim(coalesce(v_item->>'classroomPassword', ''));
        v_code := upper(coalesce(nullif(v_raw_code, ''), v_raw_pass, ''));
        v_pass := coalesce(nullif(v_raw_pass, ''), v_raw_code, '');
        v_needs_setup := (v_code = '' and v_pass = '');

        insert into public.enrolled_students (
            email, full_name, purchase_code, classroom_password, classroom_url, max_devices, is_active, needs_password_setup
        ) values (
            v_email,
            trim(coalesce(v_item->>'fullName', '')),
            v_code,
            v_pass,
            trim(coalesce(v_item->>'classroomUrl', '')),
            greatest(1, least(5, coalesce((v_item->>'maxDevices')::integer, 2))),
            coalesce((v_item->>'isActive')::boolean, true),
            v_needs_setup
        )
        on conflict (email) do update
        set full_name = case when trim(excluded.full_name) <> '' then excluded.full_name else public.enrolled_students.full_name end,
            purchase_code = case when excluded.purchase_code <> '' then excluded.purchase_code else public.enrolled_students.purchase_code end,
            classroom_password = case when excluded.classroom_password <> '' then excluded.classroom_password else public.enrolled_students.classroom_password end,
            classroom_url = case when excluded.classroom_url <> '' then excluded.classroom_url else public.enrolled_students.classroom_url end,
            needs_password_setup = case
                when excluded.classroom_password <> '' or excluded.purchase_code <> '' then false
                else public.enrolled_students.needs_password_setup
            end,
            max_devices = excluded.max_devices,
            is_active = excluded.is_active,
            updated_at = now();

        v_imported := v_imported + 1;
    end loop;

    return jsonb_build_object('ok', true, 'importedCount', v_imported);
end;
$$;

grant execute on function public.check_student_email(text) to anon, authenticated;
grant execute on function public.activate_student_access(text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.verify_student_access(text, text, text, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.save_student_classroom_credentials(text, text, text, text) to anon, authenticated;
grant execute on function public.save_student_progress(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.log_student_activity(text, text, text, text, text) to anon, authenticated;
grant execute on function public.verify_admin_access(text, text) to anon, authenticated;
grant execute on function public.admin_change_password(text, text, text) to anon, authenticated;
grant execute on function public.admin_register_user(text, text, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.request_collaborator_access(text, text, text) to anon, authenticated;
grant execute on function public.admin_review_collaborator(text, text, uuid, boolean) to anon, authenticated;
grant execute on function public.admin_delete_user(text, text, uuid) to anon, authenticated;
grant execute on function public.admin_update_user_role(text, text, uuid, text) to anon, authenticated;
grant execute on function public.admin_toggle_workshop_recording(text, text, text, boolean) to anon, authenticated;
grant execute on function public.admin_list_dashboard(text, text) to anon, authenticated;
grant execute on function public.admin_upsert_student(text, text, text, text, text, text, text, integer, boolean) to anon, authenticated;
grant execute on function public.admin_upsert_students_bulk(text, text, jsonb) to anon, authenticated;
grant execute on function public.admin_reset_student_devices(text, text, uuid) to anon, authenticated;
grant execute on function public.admin_delete_student(text, text, uuid) to anon, authenticated;

-- =====================================================================
-- 5. FORO DE DUDAS CON HILOS DE CONVERSACIÓN Y RESPUESTA OFICIAL
-- =====================================================================
create table if not exists public.forum_questions (
    id uuid primary key default gen_random_uuid(),
    workshop_id text not null default 'general',
    workshop_title text not null default 'Consulta general',
    author_name text not null check (char_length(trim(author_name)) between 1 and 120),
    author_email text not null default '',
    country_code text not null default '',
    title text not null check (char_length(trim(title)) between 1 and 200),
    body text not null default '' check (char_length(body) <= 2000),
    status text not null default 'pending' check (status in ('pending', 'answered')),
    created_at timestamptz not null default now()
);

alter table public.forum_questions
    add column if not exists country_code text not null default '';

create index if not exists idx_forum_questions_created
    on public.forum_questions (created_at desc);

create table if not exists public.forum_replies (
    id uuid primary key default gen_random_uuid(),
    question_id uuid not null references public.forum_questions(id) on delete cascade,
    author_name text not null check (char_length(trim(author_name)) between 1 and 120),
    author_role text not null default 'student' check (author_role in ('student', 'teacher')),
    author_admin_id uuid,
    author_email text not null default '',
    country_code text not null default '',
    body text not null check (char_length(trim(body)) between 1 and 2000),
    is_official boolean not null default false,
    created_at timestamptz not null default now()
);

alter table public.forum_replies
    add column if not exists author_admin_id uuid,
    add column if not exists author_email text not null default '',
    add column if not exists country_code text not null default '';

create index if not exists idx_forum_replies_question
    on public.forum_replies (question_id, created_at asc);

alter table public.forum_questions enable row level security;
alter table public.forum_replies enable row level security;

drop policy if exists "Public can read forum questions" on public.forum_questions;
create policy "Public can read forum questions"
    on public.forum_questions
    for select
    to anon, authenticated
    using (true);

drop policy if exists "Public can insert pending forum questions" on public.forum_questions;
create policy "Public can insert pending forum questions"
    on public.forum_questions
    for insert
    to anon, authenticated
    with check (
        status = 'pending'
        and char_length(trim(author_name)) between 1 and 120
        and char_length(trim(title)) between 1 and 200
        and char_length(body) <= 2000
    );

drop policy if exists "Public can read forum replies" on public.forum_replies;
create policy "Public can read forum replies"
    on public.forum_replies
    for select
    to anon, authenticated
    using (true);

drop policy if exists "Public can insert student forum replies" on public.forum_replies;
create policy "Public can insert student forum replies"
    on public.forum_replies
    for insert
    to anon, authenticated
    with check (
        author_role = 'student'
        and is_official = false
        and char_length(trim(author_name)) between 1 and 120
        and char_length(trim(body)) between 1 and 2000
    );

create or replace function public.create_forum_question(
    p_workshop_id text,
    p_workshop_title text,
    p_author_name text,
    p_author_email text default '',
    p_title text default '',
    p_body text default '',
    p_country_code text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_author text := left(trim(coalesce(p_author_name, '')), 120);
    v_email text := lower(left(trim(coalesce(p_author_email, '')), 160));
    v_title text := left(trim(coalesce(p_title, '')), 200);
    v_body text := left(trim(coalesce(p_body, '')), 2000);
    v_country text := upper(left(trim(coalesce(p_country_code, '')), 8));
    v_workshop_id text := left(coalesce(nullif(trim(p_workshop_id), ''), 'general'), 64);
    v_workshop_title text := left(coalesce(nullif(trim(p_workshop_title), ''), 'Consulta general'), 200);
    v_q public.forum_questions%rowtype;
begin
    if v_author = '' or v_title = '' then
        return jsonb_build_object('ok', false, 'message', 'Escribe tu nombre y el título de tu duda.');
    end if;

    insert into public.forum_questions (
        workshop_id, workshop_title, author_name, author_email, country_code, title, body, status
    ) values (
        v_workshop_id, v_workshop_title, v_author, v_email, v_country, v_title, v_body, 'pending'
    )
    returning * into v_q;

    insert into public.app_activity_logs (event_type, actor_email, actor_name, workshop_id, country_code)
    values ('forum_question', v_email, v_author, v_workshop_id, v_country);

    return jsonb_build_object(
        'ok', true,
        'question', jsonb_build_object(
            'id', v_q.id,
            'workshopId', v_q.workshop_id,
            'workshopTitle', v_q.workshop_title,
            'authorName', v_q.author_name,
            'countryCode', v_q.country_code,
            'title', v_q.title,
            'body', v_q.body,
            'status', v_q.status,
            'createdAt', v_q.created_at,
            'replies', '[]'::jsonb
        )
    );
end;
$$;

create or replace function public.add_student_forum_reply(
    p_question_id uuid,
    p_author_name text,
    p_body text,
    p_country_code text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_author text := left(trim(coalesce(p_author_name, '')), 120);
    v_body text := left(trim(coalesce(p_body, '')), 2000);
    v_country text := upper(left(trim(coalesce(p_country_code, '')), 8));
    v_reply public.forum_replies%rowtype;
begin
    if v_author = '' or v_body = '' then
        return jsonb_build_object('ok', false, 'message', 'Escribe tu nombre y tu comentario.');
    end if;

    insert into public.forum_replies (
        question_id, author_name, author_role, country_code, body, is_official
    ) values (
        p_question_id, v_author, 'student', v_country, v_body, false
    )
    returning * into v_reply;

    insert into public.app_activity_logs (event_type, actor_name, country_code)
    values ('forum_reply', v_author, v_country);

    return jsonb_build_object(
        'ok', true,
        'reply', jsonb_build_object(
            'id', v_reply.id,
            'questionId', v_reply.question_id,
            'authorName', v_reply.author_name,
            'authorRole', v_reply.author_role,
            'countryCode', v_reply.country_code,
            'body', v_reply.body,
            'isOfficial', v_reply.is_official,
            'createdAt', v_reply.created_at
        )
    );
end;
$$;

drop function if exists public.admin_reply_forum_question(text, text, uuid, text, text);

create or replace function public.admin_reply_forum_question(
    p_admin_email text,
    p_access_key text,
    p_question_id uuid,
    p_teacher_name text,
    p_reply_body text,
    p_country_code text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_email text := lower(trim(coalesce(p_admin_email, '')));
    v_country text := upper(left(trim(coalesce(p_country_code, '')), 8));
    v_user public.admin_users%rowtype;
    v_reply public.forum_replies%rowtype;
begin
    if not public.is_valid_admin(v_email, p_access_key) then
        return jsonb_build_object('ok', false, 'message', 'Acceso no autorizado.');
    end if;

    if trim(coalesce(p_reply_body, '')) = '' then
        return jsonb_build_object('ok', false, 'message', 'La respuesta no puede estar vacía.');
    end if;

    select * into v_user
    from public.admin_users
    where lower(admin_email) = v_email
    limit 1;

    insert into public.forum_replies (
        question_id, author_name, author_role, author_admin_id, author_email, country_code, body, is_official
    ) values (
        p_question_id,
        left(coalesce(nullif(trim(p_teacher_name), ''), v_user.display_name, 'Profesor / Colaborador'), 120),
        'teacher',
        v_user.id,
        v_email,
        v_country,
        left(trim(p_reply_body), 2000),
        true
    )
    returning * into v_reply;

    update public.forum_questions
    set status = 'answered'
    where id = p_question_id;

    insert into public.app_activity_logs (event_type, actor_email, actor_name, country_code)
    values ('forum_reply', v_email, v_reply.author_name, v_country);

    return jsonb_build_object(
        'ok', true,
        'reply', jsonb_build_object(
            'id', v_reply.id,
            'questionId', v_reply.question_id,
            'authorName', v_reply.author_name,
            'authorRole', v_reply.author_role,
            'authorAdminId', v_reply.author_admin_id,
            'countryCode', v_reply.country_code,
            'body', v_reply.body,
            'isOfficial', v_reply.is_official,
            'createdAt', v_reply.created_at
        )
    );
end;
$$;

create or replace function public.admin_delete_forum_question(
    p_admin_email text,
    p_access_key text,
    p_question_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
    if not public.is_valid_owner_admin(p_admin_email, p_access_key) then
        return jsonb_build_object('ok', false, 'message', 'Solo los organizadores de la feria pueden eliminar preguntas del foro.');
    end if;

    delete from public.forum_questions where id = p_question_id;
    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_update_forum_question(
    p_admin_email text,
    p_access_key text,
    p_question_id uuid,
    p_title text,
    p_body text default '',
    p_author_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_clean_title text := left(trim(coalesce(p_title, '')), 200);
    v_clean_body text := left(trim(coalesce(p_body, '')), 2000);
    v_clean_author text := left(trim(coalesce(p_author_name, '')), 120);
begin
    if not public.is_valid_owner_admin(p_admin_email, p_access_key) then
        return jsonb_build_object('ok', false, 'message', 'Solo los organizadores de la feria pueden editar preguntas del foro.');
    end if;

    if v_clean_title = '' then
        return jsonb_build_object('ok', false, 'message', 'El título de la consulta no puede estar vacío.');
    end if;

    update public.forum_questions
    set title = v_clean_title,
        body = v_clean_body,
        author_name = case when v_clean_author <> '' then v_clean_author else author_name end
    where id = p_question_id;

    if not found then
        return jsonb_build_object('ok', false, 'message', 'No encontramos el comentario indicado.');
    end if;

    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_update_forum_reply(
    p_admin_email text,
    p_access_key text,
    p_reply_id uuid,
    p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_email text := lower(trim(coalesce(p_admin_email, '')));
    v_clean_body text := left(trim(coalesce(p_body, '')), 2000);
    v_is_owner boolean := false;
    v_caller public.admin_users%rowtype;
    v_reply public.forum_replies%rowtype;
begin
    if not public.is_valid_admin(v_email, p_access_key) then
        return jsonb_build_object('ok', false, 'message', 'Acceso no autorizado.');
    end if;

    if v_clean_body = '' then
        return jsonb_build_object('ok', false, 'message', 'El comentario no puede quedar vacío.');
    end if;

    v_is_owner := public.is_valid_owner_admin(v_email, p_access_key);

    select * into v_reply
    from public.forum_replies
    where id = p_reply_id;

    if not found then
        return jsonb_build_object('ok', false, 'message', 'No encontramos el comentario en el hilo.');
    end if;

    if not v_is_owner then
        select * into v_caller
        from public.admin_users
        where lower(admin_email) = v_email
        limit 1;

        if not (
            (v_reply.author_admin_id is not null and v_reply.author_admin_id = v_caller.id)
            or (trim(coalesce(v_reply.author_email, '')) <> '' and lower(v_reply.author_email) = v_email)
        ) then
            return jsonb_build_object('ok', false, 'message', 'Solo puedes editar tus propias respuestas.');
        end if;
    end if;

    update public.forum_replies
    set body = v_clean_body
    where id = p_reply_id;

    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_delete_forum_reply(
    p_admin_email text,
    p_access_key text,
    p_reply_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
    if not public.is_valid_owner_admin(p_admin_email, p_access_key) then
        return jsonb_build_object('ok', false, 'message', 'Solo los organizadores de la feria pueden eliminar comentarios del hilo.');
    end if;

    delete from public.forum_replies where id = p_reply_id;
    return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.create_forum_question(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.add_student_forum_reply(uuid, text, text, text) to anon, authenticated;
grant execute on function public.admin_reply_forum_question(text, text, uuid, text, text, text) to anon, authenticated;
grant execute on function public.admin_delete_forum_question(text, text, uuid) to anon, authenticated;
grant execute on function public.admin_update_forum_question(text, text, uuid, text, text, text) to anon, authenticated;
grant execute on function public.admin_update_forum_reply(text, text, uuid, text) to anon, authenticated;
grant execute on function public.admin_delete_forum_reply(text, text, uuid) to anon, authenticated;
grant execute on function public.replace_student_device(text, text, text, text, text, text, text) to anon, authenticated;

-- =====================================================================
-- 6. ORGANIZADORES PRE-AUTORIZADOS Y ALUMNA DE PRUEBA REAL
-- =====================================================================
insert into public.admin_users (admin_email, display_name, access_key_hash, role, approval_status, must_change_password, is_active)
values
    (
        'profeyussef@gmail.com',
        'Yussef Álvarez',
        extensions.crypt('1234', extensions.gen_salt('bf')),
        'owner',
        'approved',
        true,
        true
    ),
    (
        'marketingm.digital20@gmail.com',
        'Lisbeth Mora',
        extensions.crypt('1234', extensions.gen_salt('bf')),
        'owner',
        'approved',
        true,
        true
    ),
    (
        'alizon9263@gmail.com',
        'Yill Nieto',
        extensions.crypt('1234', extensions.gen_salt('bf')),
        'owner',
        'approved',
        true,
        true
    )
on conflict (admin_email) do nothing;

insert into public.enrolled_students (email, full_name, purchase_code, classroom_password, classroom_url, max_devices, is_active, needs_password_setup)
values
    (
        'yill.nieto@gmail.com',
        'Yill Nieto',
        '',
        '',
        '',
        2,
        true,
        true
    )
on conflict (email) do nothing;

-- Recarga inmediata de caché de PostgREST para que las funciones nuevas queden disponibles al instante
notify pgrst, 'reload schema';

