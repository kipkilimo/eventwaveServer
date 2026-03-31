// --- 2. BRANDING CONSTANTS ---
const BRAND = {
  name: "EventWave",
  primaryColor: "#007bff",
  secondaryColor: "#6c757d",
  accentColor: "#28a745",
  lightColor: "#f8f9fa",
  darkColor: "#343a40",
  logoFilename: "countysquare-4-3-21.png",
  website: "https://eventwave.dev",
  supportEmail: "info@eventwave.dev",
  phone: "+254 (700) 378-241",
  address: "Ngeno Drive, Suite 120C Langata, Nairobi 00100",
};
export const emailHeader = `
  <div style="width: 100%; background: #ffffff; font-family: Helvetica, Arial, sans-serif;">

    <!-- Header Table -->
    <table width="100%" cellpadding="0" cellspacing="0" style="padding: 22px 28px;">
      <tr>

        <!-- Logo (40%) -->
        <td width="40%" valign="middle">
          <img 
            src="https://a2z-v0.s3.eu-central-1.amazonaws.com/logo.png"
            alt="${BRAND.name}"
            style="height: 62px; width: auto; display: block;"
          />
        </td>

        <!-- Text (60%) -->
        <td width="60%" valign="middle">
          <div style="font-size: 16px; font-weight: 600; color: #111827;">
            ${BRAND.name}
          </div>
          <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">
            Secure Event Platform • Fast • Reliable • Modern
          </div>
        </td>

      </tr>
    </table>

    <!-- Divider -->
    <div style="height: 1px; background: #e5e7eb;"></div>

  </div>
`;
