import {

    getDashboardStats

} from "../services/dashboard.service.js";

export async function dashboard(req,res){

    try{

        const stats = await getDashboardStats();

        return res.json({

            success:true,

            stats

        });

    }

    catch(error){

        console.error(error);

        return res.status(500).json({

            success:false,

            message:error.message

        });

    }

}