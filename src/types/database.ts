// Generado a partir del esquema real de Supabase
// Proyecto: gakvomumcqxwfimwyfxg.supabase.co

// ── Interfaces simples para uso en componentes ──────────────────────────────

export interface Proveedor {
  id: number;
  created_at: string;
  nombre: string | null;
  cuit_dni: string | null;
  telefono: string | null;
  direccion: string | null;
  activo: boolean | null;
  notas: string | null;
}

export interface Cliente {
  id: number;
  created_at: string;
  nombre: string | null;
  cuit: string | null;
  telefono: string | null;
  email: string | null;
  direccion_fabrica: string | null;
  contacto_principal: string | null;
  activo: boolean | null;
  notas: string | null;
}

export interface Fletero {
  id: number;
  created_at: string;
  nombre: string | null;
  cuit_dni: string | null;
  telefono: string | null;
  precio_por_kg: number | null;
  /** Tarifa plana por viaje de logística inversa (traer envases vacíos). DEFAULT 0. */
  precio_viaje_vacios: number | null;
  activo: boolean | null;
  notas: string | null;
}

export interface Envase {
  id: number;
  created_at: string;
  nombre: string | null;
  descripcion: string | null;
  tara_kg: number | null;
  valor_monetario: number | null;
  activo: boolean | null;
}

export interface Producto {
  id: number;
  created_at: string;
  nombre: string | null;
  descripcion: string | null;
  precio_compra_kg: number | null;
  precio_venta_kg: number | null;
  activo: boolean | null;
}

export interface EntradaFruta {
  id: number;
  created_at: string;
  fecha_entrada: string | null;
  proveedor_id: number | null;
  producto_id: number | null;
  envase_id: number | null;
  cantidad_envases: number | null;
  peso_bruto_kg: number | null;
  peso_neto_kg: number | null;
  precio_compra_kg_historico: number | null;
  notas: string | null;
  monto_total: number | null;
}

export interface SalidaFruta {
  id: number;
  created_at: string;
  fecha_salida: string | null;
  cliente_id: number | null;
  producto_id: number | null;
  fletero_id: number | null;
  peso_salida_acopio_kg: number | null;
  precio_venta_kg_historico: number | null;
  remito_nro: string | null;
  estado_conciliacion: string | null;
  peso_llegada_cliente_kg: number | null;
  /** Descuento físico en kilogramos. Fórmula: (peso_llegada - descuento_kg) × precio = monto_final */
  descuento_calidad_kg: number | null;
  monto_final_cobrar: number | null;
  notas: string | null;
  /** Tipo de envase que sale con el despacho (trazabilidad saldos con cliente) */
  envase_id: number | null;
  /** Cantidad de envases que van con el despacho; genera SALIDA_OCUPADO en Movimientos_Envases (resta ocupados) */
  cantidad_envases: number | null;
}

export interface MovimientoEnvase {
  id: number;
  created_at: string;
  fecha_movimiento: string | null;
  tipo_movimiento: string | null;
  envase_id: number | null;
  cantidad: number | null;
  proveedor_id: number | null;
  cliente_id: number | null;
  remito_asociado: string | null;
  notas: string | null;
}

export interface CuentaFinanciera {
  id: number;
  created_at: string;
  nombre: string | null;
  tipo: string | null;
  saldo_inicial: number | null;
  activo: boolean | null;
}

export interface PlanDeCuenta {
  id: number;
  created_at: string;
  nombre: string | null;
  tipo: string | null;
  codigo: string | null;
}

export type EstadoChequeTercero =
  | 'EN_CARTERA'
  | 'ENDOSADO'
  | 'DEPOSITADO'
  | 'COBRADO'
  | 'RECHAZADO';

export interface ChequeTercero {
  id: number;
  created_at: string;
  numero_cheque: string | null;
  banco: string | null;
  emisor: string | null;
  fecha_emision: string | null;
  fecha_pago: string | null;
  monto: number | null;
  estado: EstadoChequeTercero | null;
  /** Cuenta donde se depositó (clearing). Se acredita al pasar a COBRADO. */
  cuenta_deposito_id: number | null;
  cliente_id: number | null;
  proveedor_id: number | null;
  fletero_id: number | null;
}

export interface MovimientoFinanciero {
  id: number;
  created_at: string;
  fecha: string | null;
  tipo: string | null;
  monto: number | null;
  descripcion: string | null;
  metodo_pago: string | null;
  referencia: string | null;
  cuenta_financiera_id: number | null;
  plan_de_cuenta_id: number | null;
  cliente_id: number | null;
  proveedor_id: number | null;
  fletero_id: number | null;
  cheque_id: number | null;
}

export interface CobroCliente {
  id: number;
  created_at: string;
  fecha_cobro: string | null;
  cliente_id: number | null;
  monto: number | null;
  metodo_pago: string | null;
  referencia: string | null;
  notas: string | null;
}

// ── Tipo Database para createClient<Database> ───────────────────────────────
// Sigue el formato exacto que espera @supabase/supabase-js v2

export type Database = {
  public: {
    Tables: {
      Proveedores: {
        Row: Proveedor;
        Insert: {
          id?: number;
          created_at?: string;
          nombre?: string | null;
          cuit_dni?: string | null;
          telefono?: string | null;
          direccion?: string | null;
          activo?: boolean | null;
          notas?: string | null;
        };
        Update: {
          id?: number;
          created_at?: string;
          nombre?: string | null;
          cuit_dni?: string | null;
          telefono?: string | null;
          direccion?: string | null;
          activo?: boolean | null;
          notas?: string | null;
        };
        Relationships: [];
      };
      Clientes: {
        Row: Cliente;
        Insert: {
          id?: number;
          created_at?: string;
          nombre?: string | null;
          cuit?: string | null;
          telefono?: string | null;
          email?: string | null;
          direccion_fabrica?: string | null;
          contacto_principal?: string | null;
          activo?: boolean | null;
          notas?: string | null;
        };
        Update: {
          id?: number;
          created_at?: string;
          nombre?: string | null;
          cuit?: string | null;
          telefono?: string | null;
          email?: string | null;
          direccion_fabrica?: string | null;
          contacto_principal?: string | null;
          activo?: boolean | null;
          notas?: string | null;
        };
        Relationships: [];
      };
      Fleteros: {
        Row: Fletero;
        Insert: {
          id?: number;
          created_at?: string;
          nombre?: string | null;
          cuit_dni?: string | null;
          telefono?: string | null;
          precio_por_kg?: number | null;
          activo?: boolean | null;
          notas?: string | null;
        };
        Update: {
          id?: number;
          created_at?: string;
          nombre?: string | null;
          cuit_dni?: string | null;
          telefono?: string | null;
          precio_por_kg?: number | null;
          activo?: boolean | null;
          notas?: string | null;
        };
        Relationships: [];
      };
      Envases: {
        Row: Envase;
        Insert: {
          id?: number;
          created_at?: string;
          nombre?: string | null;
          descripcion?: string | null;
          tara_kg?: number | null;
          valor_monetario?: number | null;
          activo?: boolean | null;
        };
        Update: {
          id?: number;
          created_at?: string;
          nombre?: string | null;
          descripcion?: string | null;
          tara_kg?: number | null;
          valor_monetario?: number | null;
          activo?: boolean | null;
        };
        Relationships: [];
      };
      Productos: {
        Row: Producto;
        Insert: {
          id?: number;
          created_at?: string;
          nombre?: string | null;
          descripcion?: string | null;
          precio_compra_kg?: number | null;
          precio_venta_kg?: number | null;
          activo?: boolean | null;
        };
        Update: {
          id?: number;
          created_at?: string;
          nombre?: string | null;
          descripcion?: string | null;
          precio_compra_kg?: number | null;
          precio_venta_kg?: number | null;
          activo?: boolean | null;
        };
        Relationships: [];
      };
      Entradas_Fruta: {
        Row: EntradaFruta;
        Insert: {
          id?: number;
          created_at?: string;
          fecha_entrada?: string | null;
          proveedor_id?: number | null;
          producto_id?: number | null;
          envase_id?: number | null;
          cantidad_envases?: number | null;
          peso_bruto_kg?: number | null;
          peso_neto_kg?: number | null;
          precio_compra_kg_historico?: number | null;
          notas?: string | null;
          monto_total?: number | null;
        };
        Update: {
          id?: number;
          created_at?: string;
          fecha_entrada?: string | null;
          proveedor_id?: number | null;
          producto_id?: number | null;
          envase_id?: number | null;
          cantidad_envases?: number | null;
          peso_bruto_kg?: number | null;
          peso_neto_kg?: number | null;
          precio_compra_kg_historico?: number | null;
          notas?: string | null;
          monto_total?: number | null;
        };
        Relationships: [
          { foreignKeyName: 'Entradas_Fruta_proveedor_id_fkey'; columns: ['proveedor_id']; isOneToOne: false; referencedRelation: 'Proveedores'; referencedColumns: ['id'] },
          { foreignKeyName: 'Entradas_Fruta_producto_id_fkey'; columns: ['producto_id']; isOneToOne: false; referencedRelation: 'Productos'; referencedColumns: ['id'] },
          { foreignKeyName: 'Entradas_Fruta_envase_id_fkey'; columns: ['envase_id']; isOneToOne: false; referencedRelation: 'Envases'; referencedColumns: ['id'] },
        ];
      };
      Salidas_Fruta: {
        Row: SalidaFruta;
        Insert: {
          id?: number;
          created_at?: string;
          fecha_salida?: string | null;
          cliente_id?: number | null;
          producto_id?: number | null;
          fletero_id?: number | null;
          peso_salida_acopio_kg?: number | null;
          precio_venta_kg_historico?: number | null;
          remito_nro?: string | null;
          estado_conciliacion?: string | null;
          peso_llegada_cliente_kg?: number | null;
          descuento_calidad_kg?: number | null;
          monto_final_cobrar?: number | null;
          notas?: string | null;
          envase_id?: number | null;
          cantidad_envases?: number | null;
        };
        Update: {
          id?: number;
          created_at?: string;
          fecha_salida?: string | null;
          cliente_id?: number | null;
          producto_id?: number | null;
          fletero_id?: number | null;
          peso_salida_acopio_kg?: number | null;
          precio_venta_kg_historico?: number | null;
          remito_nro?: string | null;
          estado_conciliacion?: string | null;
          peso_llegada_cliente_kg?: number | null;
          descuento_calidad_kg?: number | null;
          monto_final_cobrar?: number | null;
          notas?: string | null;
          envase_id?: number | null;
          cantidad_envases?: number | null;
        };
        Relationships: [
          { foreignKeyName: 'Salidas_Fruta_cliente_id_fkey'; columns: ['cliente_id']; isOneToOne: false; referencedRelation: 'Clientes'; referencedColumns: ['id'] },
          { foreignKeyName: 'Salidas_Fruta_producto_id_fkey'; columns: ['producto_id']; isOneToOne: false; referencedRelation: 'Productos'; referencedColumns: ['id'] },
          { foreignKeyName: 'Salidas_Fruta_fletero_id_fkey'; columns: ['fletero_id']; isOneToOne: false; referencedRelation: 'Fleteros'; referencedColumns: ['id'] },
          { foreignKeyName: 'Salidas_Fruta_envase_id_fkey'; columns: ['envase_id']; isOneToOne: false; referencedRelation: 'Envases'; referencedColumns: ['id'] },
        ];
      };
      Movimientos_Envases: {
        Row: MovimientoEnvase;
        Insert: {
          id?: number;
          created_at?: string;
          fecha_movimiento?: string | null;
          tipo_movimiento?: string | null;
          envase_id?: number | null;
          cantidad?: number | null;
          proveedor_id?: number | null;
          cliente_id?: number | null;
          remito_asociado?: string | null;
          notas?: string | null;
        };
        Update: {
          id?: number;
          created_at?: string;
          fecha_movimiento?: string | null;
          tipo_movimiento?: string | null;
          envase_id?: number | null;
          cantidad?: number | null;
          proveedor_id?: number | null;
          cliente_id?: number | null;
          remito_asociado?: string | null;
          notas?: string | null;
        };
        Relationships: [
          { foreignKeyName: 'Movimientos_Envases_envase_id_fkey'; columns: ['envase_id']; isOneToOne: false; referencedRelation: 'Envases'; referencedColumns: ['id'] },
          { foreignKeyName: 'Movimientos_Envases_proveedor_id_fkey'; columns: ['proveedor_id']; isOneToOne: false; referencedRelation: 'Proveedores'; referencedColumns: ['id'] },
          { foreignKeyName: 'Movimientos_Envases_cliente_id_fkey'; columns: ['cliente_id']; isOneToOne: false; referencedRelation: 'Clientes'; referencedColumns: ['id'] },
        ];
      };
      Cuentas_Financieras: {
        Row: CuentaFinanciera;
        Insert: {
          id?: number;
          created_at?: string;
          nombre?: string | null;
          tipo?: string | null;
          saldo_inicial?: number | null;
          activo?: boolean | null;
        };
        Update: {
          id?: number;
          created_at?: string;
          nombre?: string | null;
          tipo?: string | null;
          saldo_inicial?: number | null;
          activo?: boolean | null;
        };
        Relationships: [];
      };
      Plan_de_Cuentas: {
        Row: PlanDeCuenta;
        Insert: {
          id?: number;
          created_at?: string;
          nombre?: string | null;
          tipo?: string | null;
          codigo?: string | null;
        };
        Update: {
          id?: number;
          created_at?: string;
          nombre?: string | null;
          tipo?: string | null;
          codigo?: string | null;
        };
        Relationships: [];
      };
      Movimientos_Financieros: {
        Row: MovimientoFinanciero;
        Insert: {
          id?: number;
          created_at?: string;
          fecha?: string | null;
          tipo?: string | null;
          monto?: number | null;
          descripcion?: string | null;
          metodo_pago?: string | null;
          referencia?: string | null;
          cuenta_financiera_id?: number | null;
          plan_de_cuenta_id?: number | null;
          cliente_id?: number | null;
          proveedor_id?: number | null;
          fletero_id?: number | null;
          cheque_id?: number | null;
        };
        Update: {
          id?: number;
          created_at?: string;
          fecha?: string | null;
          tipo?: string | null;
          monto?: number | null;
          descripcion?: string | null;
          metodo_pago?: string | null;
          referencia?: string | null;
          cuenta_financiera_id?: number | null;
          plan_de_cuenta_id?: number | null;
          cliente_id?: number | null;
          proveedor_id?: number | null;
          fletero_id?: number | null;
          cheque_id?: number | null;
        };
        Relationships: [
          { foreignKeyName: 'Movimientos_Financieros_cuenta_financiera_id_fkey'; columns: ['cuenta_financiera_id']; isOneToOne: false; referencedRelation: 'Cuentas_Financieras'; referencedColumns: ['id'] },
          { foreignKeyName: 'Movimientos_Financieros_plan_de_cuenta_id_fkey'; columns: ['plan_de_cuenta_id']; isOneToOne: false; referencedRelation: 'Plan_de_Cuentas'; referencedColumns: ['id'] },
          { foreignKeyName: 'Movimientos_Financieros_cliente_id_fkey'; columns: ['cliente_id']; isOneToOne: false; referencedRelation: 'Clientes'; referencedColumns: ['id'] },
          { foreignKeyName: 'Movimientos_Financieros_proveedor_id_fkey'; columns: ['proveedor_id']; isOneToOne: false; referencedRelation: 'Proveedores'; referencedColumns: ['id'] },
          { foreignKeyName: 'Movimientos_Financieros_fletero_id_fkey'; columns: ['fletero_id']; isOneToOne: false; referencedRelation: 'Fleteros'; referencedColumns: ['id'] },
        ];
      };
      Cobros_Clientes: {
        Row: CobroCliente;
        Insert: {
          id?: number;
          created_at?: string;
          fecha_cobro?: string | null;
          cliente_id?: number | null;
          monto?: number | null;
          metodo_pago?: string | null;
          referencia?: string | null;
          notas?: string | null;
        };
        Update: {
          id?: number;
          created_at?: string;
          fecha_cobro?: string | null;
          cliente_id?: number | null;
          monto?: number | null;
          metodo_pago?: string | null;
          referencia?: string | null;
          notas?: string | null;
        };
        Relationships: [
          { foreignKeyName: 'Cobros_Clientes_cliente_id_fkey'; columns: ['cliente_id']; isOneToOne: false; referencedRelation: 'Clientes'; referencedColumns: ['id'] },
        ];
      };
      Cheques_Terceros: {
        Row: ChequeTercero;
        Insert: {
          id?: number;
          created_at?: string;
          numero_cheque?: string | null;
          banco?: string | null;
          emisor?: string | null;
          fecha_emision?: string | null;
          fecha_pago?: string | null;
          monto?: number | null;
          estado?: EstadoChequeTercero | null;
          cuenta_deposito_id?: number | null;
          cliente_id?: number | null;
          proveedor_id?: number | null;
          fletero_id?: number | null;
        };
        Update: {
          id?: number;
          created_at?: string;
          numero_cheque?: string | null;
          banco?: string | null;
          emisor?: string | null;
          fecha_emision?: string | null;
          fecha_pago?: string | null;
          monto?: number | null;
          estado?: EstadoChequeTercero | null;
          cuenta_deposito_id?: number | null;
          cliente_id?: number | null;
          proveedor_id?: number | null;
          fletero_id?: number | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
