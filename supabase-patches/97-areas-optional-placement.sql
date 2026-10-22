-- QUERY NAME: 97-areas-optional-placement — Areas from the equipment Area field
-- Areas created from the equipment form or import may not have a location or department yet.
alter table public.areas alter column location_id drop not null;
alter table public.areas alter column department_id drop not null;
