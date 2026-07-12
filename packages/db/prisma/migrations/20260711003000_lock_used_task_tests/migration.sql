-- A used TaskVersion's harness is immutable: existing cases cannot change and
-- new cases cannot be attached after an attempt has captured that version.
CREATE OR REPLACE FUNCTION "prevent_used_task_test_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  old_task_version_id UUID;
  new_task_version_id UUID;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_task_version_id := OLD."taskVersionId";
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_task_version_id := NEW."taskVersionId";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Attempt"
    WHERE "taskVersionId" = old_task_version_id
       OR "taskVersionId" = new_task_version_id
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'TaskTestCase is immutable because attempts reference TaskVersion %',
      COALESCE(old_task_version_id, new_task_version_id)
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER "TaskTestCase_prevent_used_mutation" ON "TaskTestCase";

CREATE TRIGGER "TaskTestCase_prevent_used_mutation"
BEFORE INSERT OR UPDATE OR DELETE ON "TaskTestCase"
FOR EACH ROW
EXECUTE FUNCTION "prevent_used_task_test_mutation"();
