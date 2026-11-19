import { MigrationInterface, QueryRunner } from "typeorm";

export class CoreSchema1795107162059 implements MigrationInterface {
    name = 'CoreSchema1795107162059'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" text NOT NULL, "password_hash" text NOT NULL, "email_verified" boolean NOT NULL DEFAULT false, "role" text NOT NULL DEFAULT 'user', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "users_email_lower" CHECK (email = lower(email)), CONSTRAINT "users_role_check" CHECK (role IN ('user','admin')), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "auth_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid, "token_hash" text NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "last_used_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_fc7c8b01bebb6839399c494d68a" UNIQUE ("token_hash"), CONSTRAINT "PK_641507381f32580e8479efc36cd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "guest_identities" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "cookie_id" text NOT NULL, "fingerprint_hash" text, "ip_hash" text, "message_count" integer NOT NULL DEFAULT '0', "first_seen" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_8f870015b96ea50c13e375c6383" UNIQUE ("cookie_id"), CONSTRAINT "PK_4d7b4b3194a932294c731c31cb5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_50de17ed4f9945843b1968efd1" ON "guest_identities"  ("fingerprint_hash") `);
        await queryRunner.query(`CREATE INDEX "IDX_9b1a5ba139bead96a436be7aac" ON "guest_identities"  ("ip_hash") `);
        await queryRunner.query(`CREATE TABLE "chat_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "owner_user_id" uuid, "owner_guest_id" uuid, "title" text NOT NULL, "current_model" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chat_sessions_one_owner" CHECK ((owner_user_id IS NULL) <> (owner_guest_id IS NULL)), CONSTRAINT "PK_efc151a4aafa9a28b73dedc485f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "session_id" uuid NOT NULL, "role" text NOT NULL, "content" text NOT NULL, "model" text, "key_source" text, "token_usage" jsonb, "status" text NOT NULL DEFAULT 'complete', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_6be0ecc5abdb5e72a6c959a2b6" ON "messages"  ("session_id", "created_at") `);
        await queryRunner.query(`CREATE TABLE "rate_limits" ("key" text NOT NULL, "window_start" TIMESTAMP WITH TIME ZONE NOT NULL, "count" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_3213d6711ea80b8df2343869b0e" PRIMARY KEY ("key", "window_start"))`);
        await queryRunner.query(`CREATE TABLE "session_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "session_id" uuid NOT NULL, "type" text NOT NULL, "from_model" text, "to_model" text, "message_index" integer, "metadata" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_aeae988940cef0a489a14200af3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "session_model_usage" ("session_id" uuid NOT NULL, "model" text NOT NULL, "key_source" text NOT NULL, "user_messages" integer NOT NULL DEFAULT '0', "agent_messages" integer NOT NULL DEFAULT '0', "input_tokens" integer NOT NULL DEFAULT '0', "output_tokens" integer NOT NULL DEFAULT '0', "errors" integer NOT NULL DEFAULT '0', "first_used" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "last_used" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_c7c8a2938f68cd574fa96621bed" PRIMARY KEY ("session_id", "model", "key_source"))`);
        await queryRunner.query(`CREATE TABLE "user_provider_keys" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid, "provider_id" text NOT NULL, "encrypted_api_key" text NOT NULL, "key_version" integer NOT NULL DEFAULT '1', "last4" text NOT NULL, "validation_status" text NOT NULL DEFAULT 'unknown', "validated_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_e47e89115f7fcc6e919f2a0f08e" UNIQUE ("user_id", "provider_id"), CONSTRAINT "PK_7fb6d13861f08d457c28a0d8c51" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "auth_sessions" ADD CONSTRAINT "FK_50ccaa6440288a06f0ba693ccc6" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chat_sessions" ADD CONSTRAINT "FK_7ca76f4206539c14c39462b2591" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chat_sessions" ADD CONSTRAINT "FK_afa83f1397bc96e7ba9b0272d34" FOREIGN KEY ("owner_guest_id") REFERENCES "guest_identities"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "messages" ADD CONSTRAINT "FK_ff71b7760071ed9caba7f02beb4" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "session_events" ADD CONSTRAINT "FK_7e4699f97af1e889b595350dd04" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_provider_keys" ADD CONSTRAINT "FK_63161e140b1fc5fbf44c4a6a2dd" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_provider_keys" DROP CONSTRAINT "FK_63161e140b1fc5fbf44c4a6a2dd"`);
        await queryRunner.query(`ALTER TABLE "session_events" DROP CONSTRAINT "FK_7e4699f97af1e889b595350dd04"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP CONSTRAINT "FK_ff71b7760071ed9caba7f02beb4"`);
        await queryRunner.query(`ALTER TABLE "chat_sessions" DROP CONSTRAINT "FK_afa83f1397bc96e7ba9b0272d34"`);
        await queryRunner.query(`ALTER TABLE "chat_sessions" DROP CONSTRAINT "FK_7ca76f4206539c14c39462b2591"`);
        await queryRunner.query(`ALTER TABLE "auth_sessions" DROP CONSTRAINT "FK_50ccaa6440288a06f0ba693ccc6"`);
        await queryRunner.query(`DROP TABLE "user_provider_keys"`);
        await queryRunner.query(`DROP TABLE "session_model_usage"`);
        await queryRunner.query(`DROP TABLE "session_events"`);
        await queryRunner.query(`DROP TABLE "rate_limits"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6be0ecc5abdb5e72a6c959a2b6"`);
        await queryRunner.query(`DROP TABLE "messages"`);
        await queryRunner.query(`DROP TABLE "chat_sessions"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9b1a5ba139bead96a436be7aac"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_50de17ed4f9945843b1968efd1"`);
        await queryRunner.query(`DROP TABLE "guest_identities"`);
        await queryRunner.query(`DROP TABLE "auth_sessions"`);
        await queryRunner.query(`DROP TABLE "users"`);
    }

}
