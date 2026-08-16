-- QUERY NAME: 52-warranty-serial-format — Warranty S.No. as WM/YYYY/0000
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 51-warranty-vendor-link.sql
-- ══════════════════════════════════════════════════════════════

alter table public.warranties
  alter column serial_number type text
  using (
    case
      when serial_number::text ~ '^WM/[0-9]{4}/[0-9]+$' then serial_number::text
      else
        'WM/'
        || extract(year from coalesce(created_at, now()))::text
        || '/'
        || lpad(serial_number::text, 4, '0')
    end
  );

create index if not exists idx_warranties_org_serial on public.warranties(org_id, serial_number desc);
