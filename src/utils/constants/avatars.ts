// TODO: Update avatars with real urls
export const Avatars = [
    {
        name: "avatar-1",
        url: "/avatars/avatar-1.png"
    },
    {
        name: "avatar-2",
        url: "/avatars/avatar-2.png"
    }
]

export function getRandomAvatar() {
    const randomIndex = Math.floor(Math.random() * Avatars.length);
    return Avatars[randomIndex];
}