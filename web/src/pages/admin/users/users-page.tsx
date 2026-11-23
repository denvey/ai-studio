import { AdminPageFrame } from "../components/admin-shell";
import { useAdminContext } from "../admin-context";
import UsersPanel from "./users-panel";
import { translate } from "@/i18n";


export default function UsersPage() {
    const { updateUserReference } = useAdminContext();
    return (
        <AdminPageFrame title={translate("adminPages.users.usersPage.userManagement")} description={translate("adminPages.users.usersPage.accountRoleAndStatus")}>
            <UsersPanel onUserChanged={updateUserReference} />
        </AdminPageFrame>
    );
}
