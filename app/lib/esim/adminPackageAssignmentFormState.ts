export type AdminPackageAssignmentActionState =
  | { ok: true }
  | {
      ok: false;
      error?: string;
      fieldErrors?: {
        destination?: string;
        offerId?: string;
        reason?: string;
        internalReference?: string;
        confirm?: string;
        confirmPhrase?: string;
      };
    };

export const initialAdminPackageAssignmentState: AdminPackageAssignmentActionState =
  { ok: true };
