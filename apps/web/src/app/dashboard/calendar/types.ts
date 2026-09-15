export interface ApiAppointment {
  id: string;
  tenantId: string;
  patientId: string;
  doctorId: string;
  serviceId: string;
  startTime: string;
  endTime: string;
  status: string;
  paymentStatus: string;
  depositAmountMxn?: number | null;
  channelOrigin: string;
  symptoms?: string | null;
  notes?: string | null;
  createdAt: string;
  patient: {
    id: string;
    fullName: string;
    phoneE164: string;
  };
  doctor: {
    id: string;
    name: string;
    specialty: string;
  };
  service: {
    id: string;
    name: string;
    priceMxn: number;
    durationMinutes: number;
  };
}

export interface TenantDoctor {
  id: string;
  name: string;
  specialty: string;
}

export interface TenantService {
  id: string;
  name: string;
  priceMxn: number;
  durationMinutes: number;
  requiredDepositMxn: number;
}

export interface TenantCatalogItem {
  id: string;
  name: string;
  doctors?: TenantDoctor[];
  services?: TenantService[];
}
