-- Card 14: "not set" must differ from 0. Until the user gives food + transport per day,
-- spare and the purchase limit are unknown and the app asks instead of assuming 0.
alter table cycles
  alter column essential_food_daily drop not null,
  alter column essential_food_daily drop default,
  alter column essential_transport_daily drop not null,
  alter column essential_transport_daily drop default,
  add constraint cycles_essentials_together
    check ((essential_food_daily is null) = (essential_transport_daily is null));
