


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';


-- Not captured by a plain `--schema public` pg_dump since it's an
-- extension/auth-schema object, but confirmed present on prod via
-- `supabase db pull`'s declarative diff. See docs/ARCHITECTURE.md's
-- balldontlie sync / pg_net section for why this lives in "public".
create extension if not exists "pg_net" with schema "public";



CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


-- Lives on auth.users, not a public-schema object, so a plain
-- `--schema public` pg_dump misses it — confirmed present on prod via
-- `supabase db pull`'s declarative diff. Auto-creates the profiles row on
-- signup, see docs/ARCHITECTURE.md's Login/Profile section.
CREATE TRIGGER "on_auth_user_created" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();


CREATE OR REPLACE FUNCTION "public"."notify_fighter_added_to_fight"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  fighter_name_1 text;
  fighter_name_2 text;
  messages jsonb;
begin
  select name into fighter_name_1 from fighters where id = new.fighter1_id;
  select name into fighter_name_2 from fighters where id = new.fighter2_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'to', ps.push_token,
    'title', 'Neuer Fight angekündigt',
    'body', fighter_name_1 || ' vs. ' || fighter_name_2
  )), '[]'::jsonb)
  into messages
  from push_subscriptions ps
  where ps.fighter_id in (new.fighter1_id, new.fighter2_id);

  if jsonb_array_length(messages) > 0 then
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
      body := messages
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_fighter_added_to_fight"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."event_favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."event_favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_follows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."event_follows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "event_date" timestamp with time zone NOT NULL,
    "city" "text",
    "country" "text",
    "venue" "text",
    "poster_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "external_id" integer,
    "venue_state" "text",
    "status" "text",
    "main_card_start_time" timestamp with time zone,
    "prelims_start_time" timestamp with time zone,
    "early_prelims_start_time" timestamp with time zone
);


ALTER TABLE "public"."events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fighter_favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "fighter_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fighter_favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fighters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "nickname" "text",
    "nationality" "text",
    "photo_url" "text",
    "tapology_url" "text",
    "sherdog_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "external_id" integer,
    "record_wins" integer,
    "record_losses" integer,
    "record_draws" integer,
    "record_no_contests" integer,
    "weight_class" "text",
    "height_inches" integer,
    "reach_inches" integer,
    "weight_lbs" integer,
    "stance" "text",
    "date_of_birth" "date",
    "birth_place" "text",
    "active" boolean
);


ALTER TABLE "public"."fighters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fights" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "fighter1_id" "uuid" NOT NULL,
    "fighter2_id" "uuid" NOT NULL,
    "weight_class" "text",
    "is_main_event" boolean DEFAULT false,
    "is_title_fight" boolean DEFAULT false,
    "card_position" integer,
    "result_winner_id" "uuid",
    "result_method" "text",
    "result_round" integer,
    "result_time" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "external_id" integer,
    "card_segment" "text",
    "status" "text",
    "scheduled_rounds" integer,
    "result_method_detail" "text"
);


ALTER TABLE "public"."fights" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "short_name" "text" NOT NULL,
    "logo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "external_id" integer
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "nickname" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "push_token" "text" NOT NULL,
    "fighter_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid"
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."event_favorites"
    ADD CONSTRAINT "event_favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_favorites"
    ADD CONSTRAINT "event_favorites_user_id_event_id_key" UNIQUE ("user_id", "event_id");



ALTER TABLE ONLY "public"."event_follows"
    ADD CONSTRAINT "event_follows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_follows"
    ADD CONSTRAINT "event_follows_user_id_event_id_key" UNIQUE ("user_id", "event_id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_external_id_key" UNIQUE ("external_id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fighter_favorites"
    ADD CONSTRAINT "fighter_favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fighter_favorites"
    ADD CONSTRAINT "fighter_favorites_user_id_fighter_id_key" UNIQUE ("user_id", "fighter_id");



ALTER TABLE ONLY "public"."fighters"
    ADD CONSTRAINT "fighters_external_id_key" UNIQUE ("external_id");



ALTER TABLE ONLY "public"."fighters"
    ADD CONSTRAINT "fighters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fights"
    ADD CONSTRAINT "fights_external_id_key" UNIQUE ("external_id");



ALTER TABLE ONLY "public"."fights"
    ADD CONSTRAINT "fights_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_external_id_key" UNIQUE ("external_id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_short_name_key" UNIQUE ("short_name");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_nickname_key" UNIQUE ("nickname");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_push_token_fighter_id_key" UNIQUE ("push_token", "fighter_id");



CREATE INDEX "idx_events_date" ON "public"."events" USING "btree" ("event_date");



CREATE INDEX "idx_events_org" ON "public"."events" USING "btree" ("organization_id");



CREATE INDEX "idx_fights_event" ON "public"."fights" USING "btree" ("event_id");



CREATE OR REPLACE TRIGGER "on_fight_created" AFTER INSERT ON "public"."fights" FOR EACH ROW EXECUTE FUNCTION "public"."notify_fighter_added_to_fight"();



ALTER TABLE ONLY "public"."event_favorites"
    ADD CONSTRAINT "event_favorites_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_favorites"
    ADD CONSTRAINT "event_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_follows"
    ADD CONSTRAINT "event_follows_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_follows"
    ADD CONSTRAINT "event_follows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fighter_favorites"
    ADD CONSTRAINT "fighter_favorites_fighter_id_fkey" FOREIGN KEY ("fighter_id") REFERENCES "public"."fighters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fighter_favorites"
    ADD CONSTRAINT "fighter_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fights"
    ADD CONSTRAINT "fights_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fights"
    ADD CONSTRAINT "fights_fighter1_id_fkey" FOREIGN KEY ("fighter1_id") REFERENCES "public"."fighters"("id");



ALTER TABLE ONLY "public"."fights"
    ADD CONSTRAINT "fights_fighter2_id_fkey" FOREIGN KEY ("fighter2_id") REFERENCES "public"."fighters"("id");



ALTER TABLE ONLY "public"."fights"
    ADD CONSTRAINT "fights_result_winner_id_fkey" FOREIGN KEY ("result_winner_id") REFERENCES "public"."fighters"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_fighter_id_fkey" FOREIGN KEY ("fighter_id") REFERENCES "public"."fighters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Public read access" ON "public"."events" FOR SELECT USING (true);



CREATE POLICY "Public read access" ON "public"."fighters" FOR SELECT USING (true);



CREATE POLICY "Public read access" ON "public"."fights" FOR SELECT USING (true);



CREATE POLICY "Public read access" ON "public"."organizations" FOR SELECT USING (true);



ALTER TABLE "public"."event_favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_follows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fighter_favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fighters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fights" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "manage own event favorites" ON "public"."event_favorites" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "manage own event follows" ON "public"."event_follows" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "manage own fighter favorites" ON "public"."fighter_favorites" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "push_subscriptions delete" ON "public"."push_subscriptions" FOR DELETE USING ((("user_id" IS NULL) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "push_subscriptions insert" ON "public"."push_subscriptions" FOR INSERT WITH CHECK ((("user_id" IS NULL) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "push_subscriptions select" ON "public"."push_subscriptions" FOR SELECT USING ((("user_id" IS NULL) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "select own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "supabase_auth_admin";



REVOKE ALL ON FUNCTION "public"."notify_fighter_added_to_fight"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_fighter_added_to_fight"() TO "service_role";
GRANT ALL ON FUNCTION "public"."notify_fighter_added_to_fight"() TO "supabase_auth_admin";



GRANT ALL ON TABLE "public"."event_favorites" TO "anon";
GRANT ALL ON TABLE "public"."event_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."event_favorites" TO "service_role";



GRANT ALL ON TABLE "public"."event_follows" TO "anon";
GRANT ALL ON TABLE "public"."event_follows" TO "authenticated";
GRANT ALL ON TABLE "public"."event_follows" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."fighter_favorites" TO "anon";
GRANT ALL ON TABLE "public"."fighter_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."fighter_favorites" TO "service_role";



GRANT ALL ON TABLE "public"."fighters" TO "anon";
GRANT ALL ON TABLE "public"."fighters" TO "authenticated";
GRANT ALL ON TABLE "public"."fighters" TO "service_role";



GRANT ALL ON TABLE "public"."fights" TO "anon";
GRANT ALL ON TABLE "public"."fights" TO "authenticated";
GRANT ALL ON TABLE "public"."fights" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







