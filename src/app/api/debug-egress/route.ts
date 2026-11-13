
export async function GET() {
    try {
        const response = await fetch(
            "https://api.ipify.org?format=json",
            { cache: "no-store" }
        );

        const data = await response.json();

        console.log("HOSTINGER_OUTBOUND_IP:", data.ip);

        return Response.json({ success: true });
    } catch (error) {
        console.error("OUTBOUND_IP_CHECK_FAILED:", error);

        return Response.json(
            { success: false },
            { status: 500 }
        );
    }
}
