// Жизнь Эво начинается вместе с сервером: при каждом старте Node-процесса
// запускаем эволюционный движок в живом режиме (Tamagotchi 24/7).
// Файл выполняется один раз при загрузке сервера — до обработки запросов.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensurePetAlive } = await import("./lib/pet-life");
    ensurePetAlive();
  }
}
