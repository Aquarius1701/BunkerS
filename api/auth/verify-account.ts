export default function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const { login, password } = body;
  const cleanLogin = String(login || '').trim().toUpperCase();
  const cleanPass = String(password || '').trim();

  // Bunker Admin
  if (cleanLogin === 'ADMIN' && (cleanPass === 'BUNKER' || cleanPass === 'bunker2026')) {
    return res.status(200).json({
      success: true,
      verifiedRole: 'bunker_admin',
      userId: 'bunker-admin-master',
    });
  }

  // Master Admin
  if (cleanLogin === 'ADMIN.' && (cleanPass === 'ADMIN.' || cleanPass === 'Admin123$!')) {
    return res.status(200).json({
      success: true,
      verifiedRole: 'admin',
      isSubAdmin: false,
      userId: 'admin-master',
    });
  }

  // Demo Zavod Supplier
  if (cleanLogin.toLowerCase() === 'bekobod_metall' && (cleanPass === 'parol123' || cleanPass === 'bekobod2026')) {
    return res.status(200).json({
      success: true,
      verifiedRole: 'supplier',
      userId: 'supp-uz-bekobod-01',
    });
  }

  // Demo Cement Supplier
  if (cleanLogin.toLowerCase() === 'qizilqum_sement' && (cleanPass === 'parol123' || cleanPass === 'sement2026')) {
    return res.status(200).json({
      success: true,
      verifiedRole: 'supplier',
      userId: 'supp-uz-qizilqum-02',
    });
  }

  return res.status(200).json({
    success: false,
    error: 'Noto‘g‘ri login yoki parol',
  });
}
