-- Valores al cobro (clearing): cuenta donde se deposita el cheque.
-- No afecta saldo hasta que el cheque pase a COBRADO.
ALTER TABLE "Cheques_Terceros"
  ADD COLUMN IF NOT EXISTS cuenta_deposito_id integer NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Cheques_Terceros_cuenta_deposito_id_fkey') THEN
    ALTER TABLE "Cheques_Terceros"
      ADD CONSTRAINT "Cheques_Terceros_cuenta_deposito_id_fkey"
      FOREIGN KEY (cuenta_deposito_id) REFERENCES "Cuentas_Financieras"(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN "Cheques_Terceros".cuenta_deposito_id IS 'Cuenta bancaria donde se depositó el cheque (clearing). Se acredita al pasar a COBRADO.';
