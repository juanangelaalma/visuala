import { redirect } from "next/navigation";
import { getOwnedCreativeProject } from "@/application/creative-video/get-owned-project";
import { createCreativeVideoServices } from "@/application/creative-video/services";
import CreativeVideoWorkspace from "@/features/creative-video/components/CreativeVideoWorkspace";

type DashboardPageProps = {
  searchParams: Promise<{ project?: string | string[] }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const services = await createCreativeVideoServices();
  const user = await services.authProvider.getCurrentUser();
  if (!user) redirect("/login");
  const value = (await searchParams).project;
  const projectId = Array.isArray(value) ? value[0] : value;
  const aggregate = projectId ? await getOwnedCreativeProject(services.projects, projectId, user.id) : null;

  return (
    <section className="rounded-3xl bg-black px-4 py-6 text-white md:px-7 md:py-8">
      <div className="mb-7">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#EFF31B]">Creative video foundation</p>
        <h1 className="mt-3 font-display text-3xl font-bold uppercase leading-tight md:text-5xl">Dari foto produk<br />jadi ide video.</h1>
      </div>
      {projectId && !aggregate ? <div role="alert" className="mb-5 rounded-2xl border border-white/10 bg-[#161616] p-4 text-sm text-neutral-300">Proyek tidak ditemukan. Mulai proyek baru di bawah.</div> : null}
      <CreativeVideoWorkspace aggregate={aggregate} />
    </section>
  );
}
