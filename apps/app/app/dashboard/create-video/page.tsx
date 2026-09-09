import VideoPromptBar from "./_components/VideoPromptBar";

function CreateVideoPage() {
  return (
    <section className="relative flex min-h-[560px] items-center justify-center overflow-hidden rounded-3xl bg-pricing-bg px-4 py-16 sm:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-[12%] top-[18%] h-64 rounded-full bg-primary/5 blur-6xl" />
      <div className="relative flex w-full flex-col items-center">
        <p className="mb-5 font-sans-secondary text-xs font-semibold uppercase tracking-[0.22em] text-primary">Mulai dari sebuah ide</p>
        <h1 className="mb-8 max-w-2xl text-center font-display text-3xl font-semibold leading-tight tracking-[-0.025em] text-white sm:text-4xl">
          Video seperti apa yang ingin kamu buat?
        </h1>
        <VideoPromptBar />
      </div>
    </section>
  );
}

export default CreateVideoPage;
