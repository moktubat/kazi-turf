import type { Metadata } from "next";
import { Suspense } from "react";
import { CustomerList } from "@/components/pages/admin/customers/CustomerList";
import { customerFiltersFromQuery } from "@/lib/customerFilters";
import { listCustomers } from "@/server/admin/customers";
import { requireAdminPage } from "@/server/auth/pageGuards";
import CustomersLoading from "./loading";

export const metadata: Metadata = { title: "Customers" };

type Params = Promise<Record<string, string | string[] | undefined>>;

// Super Admin only: customer contact details, payments and refunds are not shown to staff.
async function CustomersContent({ searchParams }: { searchParams: Params }) {
    const user = await requireAdminPage("/admin/customers");
    const filters = customerFiltersFromQuery(await searchParams);
    const { customers, next } = await listCustomers(user, filters);
    return <CustomerList customers={customers} filters={filters} next={next} />;
}

export default function CustomersPage({ searchParams }: { searchParams: Params }) {
    return (
        <div className="mx-auto max-w-main space-y-5 px-4 py-5 pb-24">
            <h1 className="text-2xl font-extrabold md:text-3xl">Customers</h1>
            <Suspense fallback={<CustomersLoading bare />}>
                <CustomersContent searchParams={searchParams} />
            </Suspense>
        </div>
    );
}
