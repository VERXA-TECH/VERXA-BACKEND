import AppError from "../utils/appError";
import ResponseHelper from "../utils/helpers/response.helper";
import { UserRepository } from "../repository/user";
import AuthHelper from "../utils/helpers/auth.helper";
import { VerxatagRepository } from "../repository/verxatag";

export class UserService {
    private userRepository = new UserRepository();
    private verxatagRepository = new VerxatagRepository();

    async updateBasicProfile(userId: string, data: {
        firstName: string;
        middleName?: string | null;
        lastName: string;
        gender: string;
        phoneNumber: string;
        referralCode?: string | null;
    }) {
        const { firstName, middleName, lastName, gender, phoneNumber, referralCode } = data;

        let referredBy: string | null = null;
        if (referralCode) {
            // Check if the provided referral code matches an active Verxatag (which serves as username)
            const verxatagRecord = await this.verxatagRepository.findActiveByUsername(referralCode.trim());
            if (!verxatagRecord) {
                throw new AppError("Invalid referral code.", ResponseHelper.BAD_REQUEST);
            }
            const referrer = await this.userRepository.findById(verxatagRecord.userId);
            if (!referrer) {
                throw new AppError("Invalid referral code.", ResponseHelper.BAD_REQUEST);
            }
            if (referrer.id === userId) {
                throw new AppError("You cannot refer yourself.", ResponseHelper.BAD_REQUEST);
            }
            referredBy = referrer.id;
        }

        await this.userRepository.update(userId, {
            firstName,
            middleName: middleName || null,
            lastName,
            gender,
            phoneNumber,
            ...(referredBy ? { referredBy } : {}),
            updatedAt: new Date(),
        });
    }

    async createPassword(userId: string, password: string) {
        const passwordHash = await AuthHelper.passwordToHash(password);

        await this.userRepository.update(userId, {
            passwordHash,
            updatedAt: new Date(),
        });
    }

    async updatePurposes(userId: string, purposes: string[]) {
        await this.userRepository.update(userId, {
            purposes,
            updatedAt: new Date(),
        });
    }
}

export default UserService;
