export function getRestaurantTz(): string {
  return process.env.RESTAURANT_TZ || "Europe/Moscow";
}
